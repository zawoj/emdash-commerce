import type { OrderConfirmationProps, OrderProgressProps, OrderSummaryProps, SummaryRow } from "@emdash-commerce/design-system";
// Deep imports of the closed vocabularies: the package barrel pulls every .astro component into a unit test.
import { orderConfirmationTones } from "@emdash-commerce/design-system/components/parts/order-confirmation/types.ts";
import { timelineStates } from "@emdash-commerce/design-system/components/molecules/timeline/variants.ts";
import { variantOptionsLabelOf, type OrderView } from "@emdash-commerce/plugin-stripe/contracts";

import { intlLocaleOf, type Locale } from "../../lib/i18n";
import { formatMoney } from "../../lib/money";
import { format } from "../../lib/strings";
import { FULFILLMENT_STATUSES, PAYMENT_STATUSES } from "./constants";
import type { OrdersCopy } from "./copy";

type Tone = OrderConfirmationProps["tone"];
type StepState = OrderProgressProps["steps"][number]["state"];

export interface OrderPageProps {
	confirmation: OrderConfirmationProps;
	summary: OrderSummaryProps;
	/** Absent when the order failed or was cancelled: a progress track would promise a shipment that will not happen. */
	progress: OrderProgressProps | null;
}

const FAILED_PAYMENTS: ReadonlySet<string> = new Set([
	PAYMENT_STATUSES.failed,
	PAYMENT_STATUSES.cancelled,
	PAYMENT_STATUSES.disputeLost,
]);
const SETTLED_PAYMENTS: ReadonlySet<string> = new Set([
	PAYMENT_STATUSES.paid,
	PAYMENT_STATUSES.partiallyRefunded,
	PAYMENT_STATUSES.refunded,
	PAYMENT_STATUSES.disputed,
]);
const SENT_FULFILLMENTS: ReadonlySet<string> = new Set([
	FULFILLMENT_STATUSES.fulfilled,
	FULFILLMENT_STATUSES.partiallyReturned,
	FULFILLMENT_STATUSES.returned,
]);

const isFailedPayment = (status: string): boolean => FAILED_PAYMENTS.has(status);
const isSettledPayment = (status: string): boolean => SETTLED_PAYMENTS.has(status);
const isSentFulfillment = (status: string): boolean => SENT_FULFILLMENTS.has(status);

/** Looks a status up in its label table; a status a newer plugin adds shows as "Unknown" instead of failing the page. */
const labelOf = (labels: Record<string, string>, status: string, copy: OrdersCopy): string => labels[status] ?? copy.unknownStatus;

const toneOf = (paymentStatus: string): Tone => {
	if (paymentStatus === PAYMENT_STATUSES.pending) return orderConfirmationTones.pending;
	if (isFailedPayment(paymentStatus)) return orderConfirmationTones.failed;
	return orderConfirmationTones.success;
};

/** The placement date in UTC, so a server and a browser in different time zones print the same day. */
const placedDateOf = (placedAt: string, locale: Locale): string => {
	const date = new Date(placedAt);
	if (Number.isNaN(date.getTime())) return placedAt;
	return new Intl.DateTimeFormat(intlLocaleOf(locale), { dateStyle: "long", timeZone: "UTC" }).format(date);
};

const stepState = (isDone: boolean, isCurrent: boolean): StepState => {
	if (isDone) return timelineStates.done;
	return isCurrent ? timelineStates.current : timelineStates.upcoming;
};

const progressOf = (view: OrderView, copy: OrdersCopy): OrderProgressProps | null => {
	if (isFailedPayment(view.paymentStatus)) return null;
	const isPaid = isSettledPayment(view.paymentStatus);
	const isSent = isSentFulfillment(view.fulfillmentStatus);
	const stateLabels: Record<StepState, string> = {
		[timelineStates.done]: copy.stateDone,
		[timelineStates.current]: copy.stateCurrent,
		[timelineStates.upcoming]: copy.stateUpcoming,
	};
	const step = (label: string, state: StepState) => ({ label, state, stateLabel: stateLabels[state] });
	return {
		label: copy.progressLabel,
		steps: [
			step(copy.stepPlaced, timelineStates.done),
			step(copy.stepPaid, stepState(isPaid, !isPaid)),
			step(copy.stepFulfilled, stepState(isSent, isPaid)),
		],
	};
};

const rowsOf = (view: OrderView, locale: Locale, copy: OrdersCopy): SummaryRow[] => {
	const { totals } = view;
	const money = (minor: number): string => formatMoney(minor, locale, totals.currency);
	const rows: SummaryRow[] = [{ label: copy.subtotal, value: money(totals.subtotal) }];
	if (totals.discount > 0) rows.push({ label: copy.discount, value: `-${money(totals.discount)}`, kind: "discount" });
	if (totals.shipping > 0) rows.push({ label: copy.shipping, value: money(totals.shipping) });
	if (totals.tax > 0) rows.push({ label: copy.tax, value: money(totals.tax), kind: "muted" });
	if (totals.refunded > 0) rows.push({ label: copy.refunded, value: `-${money(totals.refunded)}`, kind: "discount" });
	return rows;
};

/** Shapes the plugin's guest order view into the props of the design-system components that render the page. */
export const orderPageOf = (view: OrderView, locale: Locale, copy: OrdersCopy): OrderPageProps => {
	const money = (minor: number): string => formatMoney(minor, locale, view.totals.currency);
	return {
		confirmation: {
			tone: toneOf(view.paymentStatus),
			heading: copy.heading,
			text: copy.text,
			numberLabel: copy.numberLabel,
			number: view.orderNumber,
			facts: [
				{ label: copy.paymentLabel, value: labelOf(copy.paymentStatus, view.paymentStatus, copy) },
				{ label: copy.fulfillmentLabel, value: labelOf(copy.fulfillmentStatus, view.fulfillmentStatus, copy) },
				{ label: copy.placedLabel, value: placedDateOf(view.placedAt, locale) },
			],
		},
		summary: {
			heading: copy.summaryHeading,
			headingLevel: 2,
			linesLabel: copy.itemsLabel,
			lines: view.lines.map((line) => ({
				name: line.title,
				// The snapshot keeps the variant title "<product> — <options>" as it was; show only the options part.
				variantText: (line.variantTitle && variantOptionsLabelOf(line.title, line.variantTitle)) || undefined,
				quantityLabel: format(copy.quantity, { count: line.quantity }),
				price: money(line.amountTotal),
			})),
			rows: rowsOf(view, locale, copy),
			total: { label: copy.total, value: money(view.totals.total) },
		},
		progress: progressOf(view, copy),
	};
};
