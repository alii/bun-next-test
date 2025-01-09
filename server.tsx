import {fileURLToPath} from 'bun';
import {loadComponents} from 'next/dist/server/load-components';
import {AppPageRouteModule} from 'next/dist/server/route-modules/app-page/module.compiled';
import {BunNextRequest} from './BUN/http/req';
// import {BunNextResponse} from './BUN/http/res';
import {WebNextResponse} from 'next/dist/server/base-http/web';
import {ManifestRouter} from './BUN/manifest-router';

const BUILD_ID = await Bun.file('./.next/BUILD_ID').text();

const appPathsManifest = (await import('./.next/server/app-paths-manifest.json', {
	with: {type: 'json'},
})) as {};

const router = new ManifestRouter(appPathsManifest);

const staticAssets: Record<`/${string}`, Response> = {};

function toFile(mapPath: (path: string) => string) {
	return (paths: string[]) => {
		return paths.map(path => {
			const f = Bun.file(path);

			return {
				file: f,
				path: mapPath(path),
			};
		});
	};
}

const [publicFiles, assets] = await Promise.all([
	Array.fromAsync(
		new Bun.Glob('public/**/*').scan({
			dot: true,
		}),
	).then(toFile(path => path.replace('public', ''))),

	Array.fromAsync(
		new Bun.Glob('.next/static/**/*').scan({
			dot: true,
		}),
	).then(toFile(path => path.replace('.next', '/_next'))),
]);

for await (const i of [...publicFiles, ...assets]) {
	const buf = await i.file.arrayBuffer();

	staticAssets[i.path as `/${string}`] = new Response(buf, {
		headers: {
			'content-type': i.file.type,
		},
	});
}

const reallyBad404 = new Response('Not found', {
	status: 404,
	headers: {'content-type': 'text/plain'},
});

const DIST_DIR = fileURLToPath(import.meta.resolve('./.next'));

// TODO: Faster way to do this
function byteLength(payload: string): number {
	return new TextEncoder().encode(payload).buffer.byteLength;
}

Bun.serve({
	port: 3000,

	// error: async error => {
	// 	console.log(error, 'test');
	// 	return new Response('failed');
	// },

	static: staticAssets,

	fetch: async request => {
		const url = new URL(request.url);
		const match = router.match(url);

		if (!match) {
			return reallyBad404; // this is a really bad 404, beacuse ideally we actually always match a 404
		}

		const components = await loadComponents({
			distDir: DIST_DIR,
			page: match.page,
			isAppPath: true,
			isDev: false,
		});

		const bunRequest = new BunNextRequest(url, request);
		const bunResponse = new WebNextResponse();
		// const bunResponse = new BunNextResponse();

		// const routeModule = opts.routeModule as AppPageRouteModule;

		const query = Object.fromEntries(url.searchParams.entries());

		// const render = getRender({
		// 	pagesType: 'app' as import('next/dist/lib/page-types').PAGE_TYPES,
		// 	dev: false,
		// 	page: match.page,
		// 	pageMod,
		// 	appMod: _app,
		// 	errorMod: _error,
		// 	error500Mod: undefined,
		// 	Document: _document.default,
		// 	buildManifest,
		// 	reactLoadableManifest,
		// 	config: nextConfig,
		// 	buildId: BUILD_ID,
		// 	nextFontManifest: fontManifest,
		// 	incrementalCacheHandler: undefined,
		// 	renderToHTML,
		// 	clientReferenceManifest,
		// });

		try {
			// await renderToHTMLOrFlight(
			const result = await (components.routeModule as AppPageRouteModule).render(
				bunRequest,
				bunResponse,
				{
					page: match.page,
					query,
					fallbackRouteParams: null,
					params: match.params,
					renderOpts: {
						...components,
						previewProps: undefined,
						buildId: BUILD_ID,
						basePath: components.page,
						trailingSlash: false,
						supportsDynamicResponse: true,
						experimental: {
							isRoutePPREnabled: undefined,
							expireTime: undefined,
							clientTraceMetadata: undefined,
							dynamicIO: false,
							inlineCss: false,
							authInterrupts: false,
						},
						reactMaxHeadersLength: undefined,
						waitUntil: undefined,
						onClose: cb => bunResponse.onClose(cb),
						onAfterTaskError: undefined,
					},
				},
			);

			if (result.contentType) {
				bunResponse.setHeader(
					'Content-Type',
					result.contentType ? result.contentType : 'text/html; charset=utf-8',
				);
			}

			// const s = new TransformStream({
			// 	transform: (chunk, c) => {
			// 		console.log({chunk});
			// 		c.enqueue(chunk);
			// 	},
			// });

			// result.pipeTo(s.writable);

			let promise: Promise<void> | undefined;
			if (result.isDynamic) {
				promise = result.pipeTo(bunResponse.transformStream.writable);
			} else {
				const payload = result.toUnchunkedString();
				bunResponse.setHeader('Content-Length', String(byteLength(payload)));
				// if (options.generateEtags) {
				// 	res.setHeader('ETag', generateETag(payload));
				//
				bunResponse.body(payload);
			}

			bunResponse.send();

			if (promise) await promise;

			return new Response(bunResponse.transformStream.readable);
		} catch (e) {
			console.log('error');
			console.log(e);
			return new Response('failed');
		}
	},
});

// process.on("unhandledRejection", e => {
// 	console.trace(e);
// });
