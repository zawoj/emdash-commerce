import type { EventSubscriber } from "../contracts/extensions.js";
import { CommerceError } from "../core/errors.js";
import type { AnyCommerceEvent, CommerceEvent, CommerceEventType } from "../core/events.js";
import type { CommerceContainer } from "../plugin/container.js";
import type { OutboxRecord } from "../ports/repositories.js";
import { createExtensionContext } from "./extension-context.js";
import { errorMessage, nextAttemptIso, withTimeout } from "./payments/async.js";
import { builtInSubscribers } from "./subscribers/index.js";
import type { EventPublisher } from "./contracts.js";

/** A subscriber that takes longer is treated as failed and retried (it may still finish: at-least-once). */
export const OUTBOX_DELIVERY_TIMEOUT_MS = 5_000;
/** Failed deliveries are retried with backoff; the Nth failure parks the delivery as `dead` (manual retry). */
export const OUTBOX_MAX_ATTEMPTS = 8;
/** While a worker delivers, the delivery's `nextAttemptAt` is pushed out by this much so a second worker skips it. */
export const OUTBOX_LEASE_MS = 60_000;

const MAX_CAS_ATTEMPTS = 12;

type Delivery = OutboxRecord["deliveries"][string];
type AnySubscriber = EventSubscriber<CommerceEventType>;

/** Built-in subscribers first, then the site's; the first registration of an id wins and a duplicate is logged. */
export const resolveSubscribers = (container: CommerceContainer): AnySubscriber[] => {
	const byId = new Map<string, AnySubscriber>();
	for (const subscriber of [...builtInSubscribers(container), ...(container.extensions.subscribers ?? [])]) {
		if (byId.has(subscriber.id)) {
			container.log.warn("Duplicate event subscriber id ignored", { subscriberId: subscriber.id });
			continue;
		}
		byId.set(subscriber.id, subscriber);
	}
	return [...byId.values()];
};

const isDeliverable = (delivery: Delivery): boolean => delivery.status === "pending" || delivery.status === "failed";

const isDue = (delivery: Delivery, nowIso: string): boolean =>
	isDeliverable(delivery) && (delivery.nextAttemptAt === null || delivery.nextAttemptAt <= nowIso);

type Outcome = { isDelivered: true } | { isDelivered: false; error: string };

/**
 * The domain-event outbox. `publish` writes the event once per interested subscriber (idempotent on the
 * event id, so a replayed webhook that re-emits an event changes nothing) and then delivers inline. Every
 * delivery is tracked per subscriber, so one failing subscriber never blocks or repeats another.
 */
export const createEventPublisher = (container: CommerceContainer): EventPublisher => {
	const { outbox, clock, log } = container;
	const subscribers = resolveSubscribers(container);
	const subscriberById = new Map(subscribers.map((subscriber) => [subscriber.id, subscriber]));
	const ctx = createExtensionContext(container);

	const invoke = async (subscriber: AnySubscriber, event: AnyCommerceEvent): Promise<Outcome> => {
		try {
			await withTimeout(
				() => subscriber.handle(event as CommerceEvent<CommerceEventType>, ctx),
				OUTBOX_DELIVERY_TIMEOUT_MS,
				`Subscriber ${subscriber.id}`,
			);
			return { isDelivered: true };
		} catch (error) {
			return { isDelivered: false, error: errorMessage(error) };
		}
	};

	/** Takes the delivery lease for every due delivery; null when another worker got there first or nothing is due. */
	const leaseDue = async (eventId: string): Promise<{ record: OutboxRecord; dueIds: string[] } | null> => {
		for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
			const found = await outbox.get(eventId);
			if (!found) return null;
			const now = clock.now();
			const nowIso = now.toISOString();
			const dueIds = Object.entries(found.value.deliveries)
				.filter(([, delivery]) => isDue(delivery, nowIso))
				.map(([id]) => id);
			if (dueIds.length === 0) return null;
			const leaseUntil = new Date(now.getTime() + OUTBOX_LEASE_MS).toISOString();
			const next: OutboxRecord = structuredClone(found.value);
			for (const id of dueIds) next.deliveries[id] = { ...next.deliveries[id]!, nextAttemptAt: leaseUntil };
			if ((await outbox.update(next, found.revision)).applied) return { record: found.value, dueIds };
		}
		return null;
	};

	const recordOutcomes = async (eventId: string, outcomes: Map<string, Outcome>): Promise<void> => {
		for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
			const found = await outbox.get(eventId);
			if (!found) return;
			const now = clock.now();
			const next: OutboxRecord = structuredClone(found.value);
			for (const [id, outcome] of outcomes) {
				const current = next.deliveries[id];
				if (!current || current.status === "delivered") continue;
				if (outcome.isDelivered) {
					next.deliveries[id] = { status: "delivered", attempts: current.attempts + 1, lastError: null, nextAttemptAt: null };
					continue;
				}
				const attempts = current.attempts + 1;
				next.deliveries[id] =
					attempts >= OUTBOX_MAX_ATTEMPTS
						? { status: "dead", attempts, lastError: outcome.error, nextAttemptAt: null }
						: { status: "failed", attempts, lastError: outcome.error, nextAttemptAt: nextAttemptIso(now, attempts) };
			}
			if ((await outbox.update(next, found.revision)).applied) return;
		}
		// The lease expires and the delivery is attempted again: at-least-once beats losing the state.
		log.warn("Outbox delivery state could not be saved", { eventId });
	};

	/** Delivers every due delivery of one event. Returns the number of deliveries attempted. */
	const deliver = async (eventId: string): Promise<number> => {
		const leased = await leaseDue(eventId);
		if (!leased) return 0;
		const outcomes = new Map<string, Outcome>();
		await Promise.all(
			leased.dueIds.map(async (id) => {
				const subscriber = subscriberById.get(id);
				if (!subscriber) {
					// Registered when the event was written, gone now (a removed extension): it runs out of attempts and dies; `retry` revives it.
					outcomes.set(id, { isDelivered: false, error: "Subscriber is not registered" });
					return;
				}
				outcomes.set(id, await invoke(subscriber, leased.record.event));
			}),
		);
		for (const [id, outcome] of outcomes) {
			if (!outcome.isDelivered) log.warn("Event delivery failed", { eventId, subscriberId: id, error: outcome.error });
		}
		await recordOutcomes(eventId, outcomes);
		return outcomes.size;
	};

	const interestedIds = (event: AnyCommerceEvent): string[] =>
		subscribers.filter((subscriber) => subscriber.events.includes(event.type)).map((subscriber) => subscriber.id);

	return {
		async publish(events) {
			if (events.length === 0) return;
			for (const event of events) await outbox.enqueue([event], interestedIds(event));
			for (const event of events) {
				try {
					await deliver(event.id);
				} catch (error) {
					log.error("Event delivery crashed", { eventId: event.id, error: errorMessage(error) });
				}
			}
		},

		async processDue(limit) {
			const due = await outbox.listDue(clock.now().toISOString(), limit);
			let attempted = 0;
			for (const record of due) {
				try {
					attempted += await deliver(record.event.id);
				} catch (error) {
					log.error("Event delivery crashed", { eventId: record.event.id, error: errorMessage(error) });
				}
			}
			return attempted;
		},

		async retry(eventId) {
			for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
				const found = await outbox.get(eventId);
				if (!found) throw new CommerceError("notFound", "No such event in the outbox");
				const next: OutboxRecord = structuredClone(found.value);
				for (const [id, delivery] of Object.entries(next.deliveries)) {
					if (delivery.status === "delivered") continue;
					next.deliveries[id] = { status: "pending", attempts: 0, lastError: null, nextAttemptAt: null };
				}
				if ((await outbox.update(next, found.revision)).applied) {
					await deliver(eventId);
					return;
				}
			}
			throw new CommerceError("conflict", "The event kept changing; try again");
		},
	};
};
