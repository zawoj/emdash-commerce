import handler, {
	createScheduledHandler,
	EmDashRoom,
	EmDashRoomSite,
	PluginBridge,
} from "@emdash-cms/cloudflare/worker";

// The Durable Object classes must be exported from the Worker entry (wrangler.jsonc `exports`).
export { EmDashRoom, EmDashRoomSite, PluginBridge };

export default {
	...handler,
	// Cron trigger: runs every plugin's scheduled tasks (the Stripe plugin's maintenance included).
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
