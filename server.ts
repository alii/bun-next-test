import type {PrerenderManifest} from 'next/dist/build';
import * as Log from 'next/dist/build/output/log';
import type {MiddlewareManifest} from 'next/dist/build/webpack/plugins/middleware-plugin';
import {fileURLToPath} from 'node:url';
import {BunNextRequest} from './BUN/http/req.ts';
import {BunNextResponse} from './BUN/http/res.ts';
import {BunNextServer} from './BUN/server.ts';
import {conf} from './conf.ts';

import prerenderManifest from './.next/prerender-manifest.json' with {type: 'json'};
import appPathsManifest from './.next/server/app-paths-manifest.json' with {type: 'json'};
import middlewareManifest from './.next/server/middleware-manifest.json' with {type: 'json'};
import nextFontManifest from './.next/server/next-font-manifest.json' with {type: 'json'};

const BUILD_ID = await Bun.file('./.next/BUILD_ID').text();

const staticAssets: Record<`/${string}`, Response> = {};

async function glob(pattern: string, mapPath: (path: string) => string) {
	const scan = new Bun.Glob(pattern).scan({dot: true});
	const paths = await Array.fromAsync(scan);

	return paths.map(path => {
		const f = Bun.file(path);

		return {
			file: f,
			path: mapPath(path),
		};
	});
}

const [publicFiles, assets] = await Promise.all([
	glob('public/**/*', path => path.replace('public', '')),
	glob('.next/static/**/*', path => path.replace('.next', '/_next')),
]);

for await (const i of [...publicFiles, ...assets]) {
	const buf = await i.file.arrayBuffer();

	staticAssets[i.path as `/${string}`] = new Response(buf, {
		headers: {
			'content-type': i.file.type,
		},
	});
}

const DIST_DIR = fileURLToPath(import.meta.resolve('./.next'));

const server = new BunNextServer({
	conf,

	interceptionRouteRewrites: [],

	distDir: DIST_DIR,
	buildId: BUILD_ID,
	publicDir: 'public',

	appPathsManifest,
	nextFontManifest,
	prerenderManifest: prerenderManifest as {} as PrerenderManifest,
	middlewareManifest: middlewareManifest as MiddlewareManifest,

	appSharedContext: {
		buildId: BUILD_ID,
	},
});

const handler = server.getRequestHandler();

const bunServer = Bun.serve({
	port: 3000,
	static: staticAssets,

	fetch: async rawRequest => {
		const url = new URL(rawRequest.url);
		const request = new BunNextRequest(url, rawRequest);
		const response = new BunNextResponse();

		await handler(request, response);

		return response.toResponse();
	},
});

Log.info('server started', bunServer.url.toString());
