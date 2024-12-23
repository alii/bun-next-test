import type { Params } from "next/dist/server/request/params";
import { removeTrailingSlash } from "next/dist/shared/lib/router/utils/remove-trailing-slash";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";

interface RouteMatch {
	modulePath: string;
	params: Params;
}

interface CompiledRoute {
	matcher: (pathname: string) => false | Params;
	modulePath: string;
}

export class ManifestRouter {
	private staticRoutes = new Map<string, string>();
	private dynamicRoutes = new Map<string, CompiledRoute>();

	constructor(private readonly routesManifest: Record<string, string>) {
		this.compileRoutes();
	}

	private compileRoutes() {
		for (const [route, modulePath] of Object.entries(this.routesManifest)) {
			const normalizedRoute = removeTrailingSlash(route)
				.replace(/\/route$/, "")
				.replace(/\/page$/, "");

			if (!normalizedRoute.includes("[")) {
				this.staticRoutes.set(normalizedRoute, modulePath);
				continue;
			}

			const regex = getRouteRegex(normalizedRoute);
			const matcher = getRouteMatcher(regex);

			this.dynamicRoutes.set(normalizedRoute, {
				matcher,
				modulePath,
			});
		}
	}

	async resolveRoute(request: Request): Promise<RouteMatch | null> {
		const url = new URL(request.url);
		let pathname = removeTrailingSlash(url.pathname);

		// Try static routes first
		const staticMatch = this.staticRoutes.get(pathname);
		if (staticMatch) {
			return {
				modulePath: staticMatch,
				params: {},
			};
		}

		// Try dynamic routes
		for (const [_, route] of this.dynamicRoutes) {
			const params = route.matcher(pathname);
			if (params !== false) {
				return {
					modulePath: route.modulePath,
					params,
				};
			}
		}

		const notFoundModule = this.routesManifest["/_not-found/page"];
		if (notFoundModule) {
			return {
				modulePath: notFoundModule,
				params: {},
			};
		}

		return null;
	}
}
