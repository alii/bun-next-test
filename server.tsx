import {fileURLToPath} from 'bun';
import type {MiddlewareManifest} from 'next/dist/build/webpack/plugins/middleware-plugin';
import {BunNextRequest} from './BUN/http/req';
import {BunNextResponse} from './BUN/http/res';
import {BunNextServer} from './BUN/server';
import {conf} from './conf';

import {PrerenderManifest} from 'next/dist/build';
import prerenderManifest from './.next/prerender-manifest.json' with {type: 'json'};
import appPathsManifest from './.next/server/app-paths-manifest.json' with {type: 'json'};
import middlewareManifest from './.next/server/middleware-manifest.json' with {type: 'json'};
import nextFontManifest from './.next/server/next-font-manifest.json' with {type: 'json'};

const BUILD_ID = await Bun.file('./.next/BUILD_ID').text();

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

const DIST_DIR = fileURLToPath(import.meta.resolve('./.next'));

const server = new BunNextServer({
	conf,
	appPathsManifest,
	nextFontManifest,
	prerenderManifest: prerenderManifest as {} as PrerenderManifest,
	middlewareManifest: middlewareManifest as MiddlewareManifest,
	distDir: DIST_DIR,
	buildId: BUILD_ID,
	publicDir: 'public',
});

const handle = server.getRequestHandler();

Bun.serve({
	port: 3000,
	static: staticAssets,

	fetch: async rawRequest => {
		const url = new URL(rawRequest.url);
		const request = new BunNextRequest(url, rawRequest);
		const response = new BunNextResponse();

		await handle(request, response);

		return await response.toResponse();
	},
});

// process.on("unhandledRejection", e => {
// 	console.trace(e);
// });
