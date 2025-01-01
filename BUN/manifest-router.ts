import type {Params} from 'next/dist/server/request/params';
import {removeTrailingSlash} from 'next/dist/shared/lib/router/utils/remove-trailing-slash';
import {getRouteMatcher} from 'next/dist/shared/lib/router/utils/route-matcher';
import {getRouteRegex} from 'next/dist/shared/lib/router/utils/route-regex';

interface RouteMatch {
	modulePath: string;
	params: Params;
	page: string;
}

interface CompiledRoute {
	matcher: (pathname: string) => false | Params;
	modulePath: string;
	page: string;
}

export class ManifestRouter {
	private staticRoutes = new Map<string, {modulePath: string; page: string}>();
	private dynamicRoutes = new Map<string, CompiledRoute>();

	constructor(private readonly routesManifest: Record<string, string>) {
		for (const [route, modulePath] of Object.entries(this.routesManifest)) {
			console.log({route});

			const normalizedRoute = removeTrailingSlash(route)
				.replace(/\/route$/, '')
				.replace(/\/page$/, '');

			const withFirstSlash = normalizedRoute.startsWith('/')
				? normalizedRoute
				: `/${normalizedRoute}`;

			if (!withFirstSlash.includes('[')) {
				this.staticRoutes.set(withFirstSlash, {
					modulePath,
					page: route,
				});

				continue;
			}

			const regex = getRouteRegex(withFirstSlash);
			const matcher = getRouteMatcher(regex);

			this.dynamicRoutes.set(withFirstSlash, {
				matcher,
				modulePath,
				page: route,
			});
		}
	}

	// TODO
	// public compileStaticRoutesToResponses(
	// 	render: (path: string) => Promise<Response>
	// ): Record<`/${string}`, Response> {
	// 	const responses: Record<`/${string}`, Response> = {};

	// 	for (const [route, { modulePath }] of this.staticRoutes) {
	// 		responses[route as `/${string}`] = new Response(modulePath, {
	// 			headers: {
	// 				"content-type": "application/javascript",
	// 			},
	// 		});
	// 	}

	// 	return responses;
	// }

	public match(url: URL): RouteMatch | null {
		const pathname = removeTrailingSlash(url.pathname);

		// Try static routes first
		const staticMatch = this.staticRoutes.get(pathname);

		if (staticMatch) {
			return {
				modulePath: staticMatch.modulePath,
				params: {},
				page: staticMatch.page,
			};
		}

		// Try dynamic routes
		for (const [_, route] of this.dynamicRoutes) {
			const params = route.matcher(pathname);

			console.log({params, route});

			if (params !== false) {
				return {
					modulePath: route.modulePath,
					params,
					page: route.page,
				};
			}
		}

		const notFoundModule = this.routesManifest['/_not-found/page'];
		if (notFoundModule) {
			return {
				modulePath: notFoundModule,
				params: {},
				page: '/_not-found/page',
			};
		}

		return null;
	}
}
