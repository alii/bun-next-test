export {};

// import { pathToRegexp } from "next/dist/compiled/path-to-regexp";
// import {
// 	INTERCEPTION_ROUTE_MARKERS,
// 	isInterceptionRouteAppPath,
// } from "next/dist/server/lib/interception-routes";
// import { normalizeLocalePath } from "next/dist/shared/lib/i18n/normalize-locale-path";
// import { getNextPathnameInfo } from "next/dist/shared/lib/router/utils/get-next-pathname-info";
// import { removePathPrefix } from "next/dist/shared/lib/router/utils/remove-path-prefix";
// import type { NextConfig } from "next/types";
// import { FSChecker } from "./fs-checker";

// interface DynamicRouteItem {
// 	page: string;
// 	regex: RegExp;
// 	routeKeys: Record<string, string>;
// 	match: (pathname: string) => false | Record<string, string>;
// }

// export interface AppRouterOutput {
// 	type: "match" | "rewrite" | "redirect";
// 	params: Record<string, string>;
// 	pathname: string;
// 	modulePath?: string;
// 	statusCode?: number;
// 	destination?: string;
// }

// function buildDynamicRoute(page: string): DynamicRouteItem {
// 	const keys: Array<{ name: string }> = [];

// 	const routeRegex = pathToRegexp(
// 		page
// 			.replace(
// 				/\[\[\.\.\.(.+?)\]\]/g,
// 				(_: string, $1: string) => `((?:/${encodeURIComponent($1)})+?)`
// 			)
// 			.replace(/\[\.\.\.(.+?)\]/g, "(.+?)")
// 			.replace(/\[(.+?)]/g, (_: string, $1: string) => `(?:${encodeURIComponent($1)})`),
// 		keys
// 	);

// 	const routeKeys = keys.reduce<Record<string, string>>((acc, key) => {
// 		if (typeof key.name === "string") {
// 			acc[key.name] = "";
// 		}

// 		return acc;
// 	}, {});

// 	return {
// 		page,
// 		regex: routeRegex,
// 		routeKeys,
// 		match: (pathname: string) => {
// 			const match = pathname.match(routeRegex);

// 			if (!match) {
// 				return false;
// 			}

// 			const params = { ...routeKeys };

// 			keys.forEach((key, i) => {
// 				if (typeof key.name === "string") {
// 					params[key.name] = decodeURIComponent(match[i + 1]);
// 				}
// 			});

// 			return params;
// 		},
// 	};
// }

// export function createAppRouter({
// 	fsChecker,
// 	config,
// }: {
// 	fsChecker: FSChecker;
// 	config: NextConfig;
// }) {
// 	const dynamicRoutes = new Map<string, DynamicRouteItem>();

// 	function buildDynamicRoutes() {
// 		const routes = fsChecker.getAppRoutes();

// 		for (const route of routes) {
// 			if (route.pathname.includes("[") && route.pathname.includes("]")) {
// 				dynamicRoutes.set(route.pathname, buildDynamicRoute(route.pathname));
// 			}
// 		}
// 	}

// 	async function resolveRoute(request: Request): Promise<AppRouterOutput> {
// 		const url = new URL(request.url);
// 		let pathname = url.pathname;

// 		// Handle basePath
// 		if (config.basePath) {
// 			if (!pathname.startsWith(config.basePath)) {
// 				return {
// 					type: "redirect",
// 					statusCode: 308,
// 					destination: config.basePath + pathname,
// 					params: {},
// 					pathname,
// 				};
// 			}
// 			pathname = removePathPrefix(pathname, config.basePath);
// 		}

// 		// Handle i18n
// 		let locale: string | undefined;
// 		if (config.i18n) {
// 			const pathInfo = getNextPathnameInfo(pathname, {
// 				nextConfig: config as any,
// 			});

// 			const localeResult = normalizeLocalePath(pathname, config.i18n.locales);
// 			pathname = localeResult.pathname;
// 			locale = localeResult.detectedLocale || config.i18n.defaultLocale;
// 		}

// 		// Try exact match first
// 		const exactMatch = await fsChecker.getItem(pathname);
// 		if (exactMatch) {
// 			return {
// 				type: "match",
// 				pathname,
// 				params: {},
// 				modulePath: exactMatch.itemPath,
// 			};
// 		}

// 		// Try dynamic routes
// 		if (dynamicRoutes.size === 0) {
// 			buildDynamicRoutes();
// 		}

// 		for (const [routePath, route] of dynamicRoutes) {
// 			const params = route.match(pathname);
// 			if (params) {
// 				const item = await fsChecker.getItem(routePath);
// 				if (item) {
// 					if (isInterceptionRouteAppPath(routePath)) {
// 						for (const segment of routePath.split("/")) {
// 							const marker = INTERCEPTION_ROUTE_MARKERS.find(m => segment.startsWith(m));
// 							if (marker) {
// 								if (marker === "(..)(..)") {
// 									params["0"] = "(..)";
// 									params["1"] = "(..)";
// 								} else {
// 									params["0"] = marker;
// 								}
// 								break;
// 							}
// 						}
// 					}

// 					return {
// 						type: "match",
// 						pathname: routePath,
// 						params,
// 						modulePath: item.itemPath,
// 					};
// 				}
// 			}
// 		}

// 		const notFound = await fsChecker.getItem("/not-found");
// 		return {
// 			type: "match",
// 			pathname: "/not-found",
// 			params: {},
// 			modulePath: notFound?.itemPath || "/_not-found",
// 			statusCode: 404,
// 		};
// 	}

// 	return {
// 		resolveRoute,
// 	};
// }
