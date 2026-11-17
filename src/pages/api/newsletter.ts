import type { APIRoute } from "astro";

/** Stub newsletter endpoint: accepts POST and answers 204 (no real subscription). */
export const prerender = false;

export const POST: APIRoute = async () => new Response(null, { status: 204 });
