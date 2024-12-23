import { AsyncLocalStorage } from "node:async_hooks";

globalThis.AsyncLocalStorage = AsyncLocalStorage;

import { getRender } from "next/dist/build/webpack/loaders/next-edge-ssr-loader/render";
import { ClientReferenceManifest } from "next/dist/build/webpack/plugins/flight-manifest-plugin";
import { renderToHTMLOrFlight as renderToHTML } from "next/dist/server/app-render/app-render";
import { NextRequestHint } from "next/dist/server/web/adapter";
import { ManifestRouter } from "./BUN/manifest-router";
import { nextConfig } from "./config";

const BUILD_ID = await Bun.file("./.next/BUILD_ID").text();

const requireFromStandaloneServer = (path: string) =>
	require(`./.next/standalone/.next/server/${path}`);

const _document = requireFromStandaloneServer("pages/_document.js");
const page = requireFromStandaloneServer("app/page.js");

declare const __RSC_MANIFEST: Record<string, ClientReferenceManifest>;

const buildManifest = await import("./.next/build-manifest.json", {
	with: { type: "json" },
});

const fontManifest = await import("./.next/server/next-font-manifest.json", {
	with: { type: "json" },
});

const reactLoadableManifest = (await import("./.next/react-loadable-manifest.json", {
	with: { type: "json" },
})) as {};

const appPathsManifest = (await import("./.next/server/app-paths-manifest.json", {
	with: { type: "json" },
})) as {};

const router = new ManifestRouter(appPathsManifest, {
	basePath: "",
	i18n: {
		defaultLocale: "en",
		locales: ["en"],
	},
});

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
		new Bun.Glob("public/**/*").scan({
			dot: true,
		})
	).then(toFile(path => path.replace("public", ""))),

	Array.fromAsync(
		new Bun.Glob(".next/static/**/*").scan({
			dot: true,
		})
	).then(toFile(path => path.replace(".next", "/_next"))),
]);

for await (const i of [...publicFiles, ...assets]) {
	const buf = await i.file.arrayBuffer();

	staticAssets[i.path as `/${string}`] = new Response(buf, {
		headers: {
			"content-type": i.file.type,
		},
	});
}

Bun.serve({
	port: 8080,

	// error: async error => {
	// 	console.log(error, "test");
	// 	return new Response("failed");
	// },

	static: staticAssets,

	fetch: async request => {
		const match = await router.resolveRoute(request);

		console.log(match);

		requireFromStandaloneServer("app/page_client-reference-manifest.js"); // defines globalThis.__RSC_MANIFEST

		const render = getRender({
			pagesType: "app" as import("next/dist/lib/page-types").PAGE_TYPES,
			dev: false,
			page: match?.params,
			pageMod: page,
			appMod: {},
			errorMod: {},
			error500Mod: {},
			Document: _document.default,
			buildManifest,
			reactLoadableManifest,
			config: nextConfig,
			buildId: BUILD_ID,
			nextFontManifest: fontManifest,
			incrementalCacheHandler: undefined,
			renderToHTML,
			clientReferenceManifest: __RSC_MANIFEST[PAGE],
		});

		try {
			const hint = new NextRequestHint({
				init: request,
				input: request,
				page: PAGE,
			});
			const response = await render(hint);
			return response;
		} catch (e) {
			console.log("error");
			console.log(e);
			return new Response("failed");
		}
	},
});

// process.on("unhandledRejection", e => {
// 	console.trace(e);
// });
