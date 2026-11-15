import type { PluginRoute, RouteContext } from "emdash";

import type { CommerceExtensions } from "../contracts/extensions.js";
import type { CommerceOptions } from "../contracts/options.js";
import { createContainer, type CommerceContainer, type ContainerDeps } from "./container.js";
import { runRoute, type RouteSpec } from "./http.js";

/** What a route module needs to define routes: its public and private route helpers. */
export interface RouteBuilder {
	options: CommerceOptions;
	extensions: CommerceExtensions;
	/** No authentication; EmDash still requires a same-origin `Origin` or `X-EmDash-Request` for non-GET. */
	publicRoute<TInput, TOutput>(config: PublicRouteConfig<TInput, TOutput>): PluginRoute;
	/** Authenticated by EmDash against `permission`; CSRF header required for session callers. */
	privateRoute<TInput, TOutput>(config: PrivateRouteConfig<TInput, TOutput>): PluginRoute;
	container(ctx: RouteContext): CommerceContainer;
}

type Method = NonNullable<PluginRoute["methods"]>[number];

export interface PublicRouteConfig<TInput, TOutput> extends RouteSpec<TInput, TOutput> {
	methods: Method[];
	/** `Cache-Control` for successful GETs (public routes only). */
	cacheControl?: string;
	request?: PluginRoute["request"];
}

export interface PrivateRouteConfig<TInput, TOutput> extends RouteSpec<TInput, TOutput> {
	methods: Method[];
	permission: NonNullable<PluginRoute["permission"]>;
}

export type RouteModule = (builder: RouteBuilder) => Record<string, PluginRoute>;

export const createRouteBuilder = (options: CommerceOptions, extensions: CommerceExtensions, deps: ContainerDeps = {}): RouteBuilder => {
	const container = (ctx: RouteContext): CommerceContainer => createContainer(ctx, options, extensions, deps);
	return {
		options,
		extensions,
		container,
		publicRoute: ({ methods, cacheControl, request, ...spec }) => ({
			public: true,
			methods,
			...(cacheControl ? { cacheControl } : {}),
			...(request ? { request } : {}),
			handler: (ctx) => runRoute(spec, ctx, container),
		}),
		privateRoute: ({ methods, permission, ...spec }) => ({
			methods,
			permission,
			handler: (ctx) => runRoute(spec, ctx, container),
		}),
	};
};
