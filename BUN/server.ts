import {loadEnvConfig} from '@next/env';
import {NextConfig} from 'next';
import {PrerenderManifest} from 'next/dist/build';
import * as Log from 'next/dist/build/output/log';
import {MiddlewareManifest} from 'next/dist/build/webpack/plugins/middleware-plugin';
import {NextFontManifest} from 'next/dist/build/webpack/plugins/next-font-manifest-plugin';
import {PagesManifest} from 'next/dist/build/webpack/plugins/pages-manifest-plugin';
import {renderToHTMLOrFlight} from 'next/dist/server/app-render/app-render';
import BaseServer, {
	FindComponentsResult,
	LoadedRenderOpts,
	MiddlewareRoutingItem,
	NextEnabledDirectories,
	NormalizedRouteManifest,
} from 'next/dist/server/base-server';
import {generateETag} from 'next/dist/server/lib/etag';
import {IncrementalCache} from 'next/dist/server/lib/incremental-cache';
import {ExpireTime, Revalidate} from 'next/dist/server/lib/revalidate';
import {loadComponents} from 'next/dist/server/load-components';
import {loadManifest} from 'next/dist/server/load-manifest';
import RenderResult, {AppPageRenderResultMetadata} from 'next/dist/server/render-result';
import {
	addRequestMeta,
	NextParsedUrlQuery,
	NextUrlWithParsedQuery,
} from 'next/dist/server/request-meta';
import {Params} from 'next/dist/server/request/params';
import {getMaybePagePath} from 'next/dist/server/require';
import ResponseCache, {ResponseCacheBase} from 'next/dist/server/response-cache';
import {PagesAPIRouteMatch} from 'next/dist/server/route-matches/pages-api-route-match';
import {PRERENDER_MANIFEST, ROUTES_MANIFEST} from 'next/dist/shared/lib/constants';
import {DeepReadonly} from 'next/dist/shared/lib/deep-readonly';
import {
	getMiddlewareRouteMatcher,
	MiddlewareRouteMatch,
} from 'next/dist/shared/lib/router/utils/middleware-route-matcher';
import {join} from 'node:path';
import {ParsedUrlQuery} from 'querystring';
import {BunNextRequest} from './http/req';
import {BunNextResponse} from './http/res';

export interface BunNextServerOptions {
	/**
	 * Object containing the configuration next.config.js
	 */
	conf: NextConfig;

	//////////////////////////////////

	buildId: string;
	publicDir: string;
	appPathsManifest: PagesManifest;
	nextFontManifest: NextFontManifest;
	middlewareManifest: MiddlewareManifest;
	prerenderManifest: PrerenderManifest;
	/**
	 * Must be an absolute path
	 */
	distDir: string;

	//////////////////////////////////
}

export class BunNextServer extends BaseServer<
	BunNextServerOptions,
	BunNextRequest,
	BunNextResponse
> {
	private static readonly MiddlewareMatcherCache = new WeakMap<
		MiddlewareManifest['middleware'][string],
		MiddlewareRouteMatch
	>();

	private static getMiddlewareMatcher(
		info: MiddlewareManifest['middleware'][string],
	): MiddlewareRouteMatch {
		const stored = BunNextServer.MiddlewareMatcherCache.get(info);
		if (stored) {
			return stored;
		}

		if (!Array.isArray(info.matchers)) {
			throw new Error(`Invariant: invalid matchers for middleware ${JSON.stringify(info)}`);
		}

		const matcher = getMiddlewareRouteMatcher(info.matchers);
		BunNextServer.MiddlewareMatcherCache.set(info, matcher);
		return matcher;
	}

	public constructor(options: BunNextServerOptions) {
		super(options);
	}

	protected getPublicDir(): string {
		return this.serverOptions.publicDir;
	}

	protected getHasStaticDir(): boolean {
		return true;
	}

	protected getPagesManifest(): PagesManifest | undefined {
		return undefined; // Bun server only works with app dir (for now..?)
	}

	protected getAppPathsManifest(): PagesManifest {
		return this.serverOptions.appPathsManifest;
	}

	protected getBuildId(): string {
		return this.buildId;
	}

	protected getinterceptionRoutePatterns(): RegExp[] {
		return this.interceptionRoutePatterns;
	}

	protected getEnabledDirectories(): NextEnabledDirectories {
		return {pages: false, app: true};
	}

	protected async findPageComponents(options: {
		page: string;
		query: NextParsedUrlQuery;
		params: Params;
		isAppPath: boolean;
		sriEnabled?: boolean;
		appPaths?: ReadonlyArray<string> | null;
		shouldEnsure?: boolean;
		url?: string;
	}): Promise<FindComponentsResult | null> {
		const result = await loadComponents({
			distDir: this.serverOptions.distDir,
			page: options.page,
			isAppPath: true,
			isDev: false,
		});

		if (!result) {
			return null;
		}

		return {
			query: {
				...(options.query || {}),
				...(options.params || {}),
			},
			components: result,
		};
	}

	private readonly prerenderManifest = loadManifest<PrerenderManifest>(
		join(this.distDir, PRERENDER_MANIFEST),
	);

	protected getPrerenderManifest() {
		return this.serverOptions.prerenderManifest;
	}

	protected getNextFontManifest(): DeepReadonly<NextFontManifest> | undefined {
		return this.serverOptions.nextFontManifest;
	}

	protected attachRequestMeta(req: BunNextRequest, parsedUrl: NextUrlWithParsedQuery): void {
		addRequestMeta(req, 'initQuery', {...parsedUrl.query});
	}

	protected async hasPage(pathname: string): Promise<boolean> {
		return !!getMaybePagePath(pathname, this.distDir, this.nextConfig.i18n?.locales, true);
	}

	private static readonly byteLengthEncoder = new TextEncoder();
	private static fastByteLength(str: string): number {
		return BunNextServer.byteLengthEncoder.encode(str).buffer.byteLength;
	}

	protected async sendRenderResult(
		req: BunNextRequest,
		res: BunNextResponse,
		options: {
			result: RenderResult;
			type: 'html' | 'json' | 'rsc';
			generateEtags: boolean;
			poweredByHeader: boolean;
			revalidate: Revalidate | undefined;
			expireTime: ExpireTime | undefined;
		},
	): Promise<void> {
		res.setHeader('X-Edge-Runtime', '1');

		// Add necessary headers.
		// @TODO: Share the isomorphic logic with server/send-payload.ts.
		if (options.poweredByHeader && options.type === 'html') {
			res.setHeader('X-Powered-By', 'Next.js');
		}

		if (!res.getHeader('Content-Type')) {
			res.setHeader(
				'Content-Type',
				options.result.contentType
					? options.result.contentType
					: options.type === 'json'
						? 'application/json'
						: 'text/html; charset=utf-8',
			);
		}

		let promise: Promise<void> | undefined;
		if (options.result.isDynamic) {
			promise = options.result.pipeTo(res.writable);
		} else {
			const payload = options.result.toUnchunkedString();
			res.setHeader('Content-Length', String(BunNextServer.fastByteLength(payload)));

			if (options.generateEtags) {
				res.setHeader('ETag', generateETag(payload));
			}

			res.body(payload);
		}

		res.send();

		// If we have a promise, wait for it to resolve.
		if (promise) await promise;
	}

	protected async runApi(
		req: BunNextRequest,
		res: BunNextResponse,
		query: ParsedUrlQuery,
		match: PagesAPIRouteMatch,
	): Promise<boolean> {
		const msg = [
			"runApi() is currently unsupported in Bun's Next.js server.",
			'This is likely a sign you are misusing the BunNextServer class.',
			"Please consult the docs to understand more about how Bun's Next server works",
		].join('\n');

		console.warn(new Error(msg));

		return true;
	}

	protected async renderHTML(
		req: BunNextRequest,
		res: BunNextResponse,
		pathname: string,
		query: NextParsedUrlQuery,
		renderOpts: LoadedRenderOpts,
	): Promise<RenderResult<AppPageRenderResultMetadata>> {
		const result = await renderToHTMLOrFlight(
			req,
			res,
			pathname,
			query,
			null,
			renderOpts,
			undefined,
			false,
		);

		return result;
	}

	protected async getIncrementalCache({
		requestHeaders,
	}: {
		requestHeaders: Record<string, undefined | string | string[]>;
		requestProtocol: 'http' | 'https';
	}): Promise<import('next/dist/server/lib/incremental-cache').IncrementalCache> {
		const dev = !!this.renderOpts.dev;
		// incremental-cache is request specific
		// although can have shared caches in module scope
		// per-cache handler
		return new IncrementalCache({
			dev,
			requestHeaders,
			dynamicIO: Boolean(this.nextConfig.experimental.dynamicIO),
			requestProtocol: 'https',
			allowedRevalidateHeaderKeys: this.nextConfig.experimental.allowedRevalidateHeaderKeys,
			minimalMode: this.minimalMode,
			fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
			maxMemoryCacheSize: this.nextConfig.cacheMaxMemorySize,
			flushToDisk: false,
			CurCacheHandler: null as never, // TODO?
			getPrerenderManifest: () => this.getPrerenderManifest(),
		});
	}

	protected getResponseCache(): ResponseCacheBase {
		return new ResponseCache(this.minimalMode);
	}

	protected loadEnvConfig({dev, forceReload}: {dev: boolean; forceReload?: boolean}): void {
		loadEnvConfig(this.dir, dev, Log, forceReload);
	}

	protected async handleUpgrade(): Promise<void> {
		const msg = [
			"handleUpgrade() is unsupported in Bun's Next.js server.",
			'This is likely a sign you are misusing the BunNextServer class.',
			"Please consult the docs to understand more about how Bun's Next server works",
		].join('\n');

		console.warn(new Error(msg));
	}

	protected getMiddlewareManifest() {
		return this.serverOptions.middlewareManifest;
	}

	protected getMiddleware(): MiddlewareRoutingItem | undefined {
		const manifest = this.getMiddlewareManifest();
		const middleware = manifest?.middleware?.['/'];

		if (!middleware) {
			return;
		}

		return {
			match: BunNextServer.getMiddlewareMatcher(middleware),
			page: '/',
		};
	}

	protected async getFallbackErrorComponents() {
		const msg = [
			"getFallbackErrorComponents() is unsupported in Bun's Next.js server.",
			'This is likely a sign you are misusing the BunNextServer class.',
			"Please consult the docs to understand more about how Bun's Next server works",
		].join('\n');

		console.warn(new Error(msg));

		return null;
	}

	protected getRoutesManifest(): NormalizedRouteManifest {
		const manifest = loadManifest(join(this.distDir, ROUTES_MANIFEST)) as any;

		let rewrites = manifest.rewrites ?? {
			beforeFiles: [],
			afterFiles: [],
			fallback: [],
		};

		if (Array.isArray(rewrites)) {
			rewrites = {
				beforeFiles: [],
				afterFiles: rewrites,
				fallback: [],
			};
		}

		return {...manifest, rewrites};
	}
}
