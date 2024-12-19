import { AsyncLocalStorage } from "node:async_hooks";

globalThis.AsyncLocalStorage = AsyncLocalStorage;

import { getRender } from "next/dist/build/webpack/loaders/next-edge-ssr-loader/render";
import { ClientReferenceManifest } from "next/dist/build/webpack/plugins/flight-manifest-plugin";
import { renderToHTMLOrFlight as renderToHTML } from "next/dist/server/app-render/app-render";
import { NextRequestHint } from "next/dist/server/web/adapter";
import { nextConfig } from "./config";

const BUILD_ID = await Bun.file("./.next/BUILD_ID").text();

const requireFromStandaloneServer = (path: string) =>
	require(`./.next/standalone/.next/server/${path}`);

const _document = requireFromStandaloneServer("pages/_document.js");
const page = requireFromStandaloneServer("app/page.js");

requireFromStandaloneServer("app/page_client-reference-manifest.js"); // defines __RSC_MANIFEST
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

// TODO: Get from request/router
const PAGE = "/page";

const render = getRender({
	pagesType: "app" as import("next/dist/lib/page-types").PAGE_TYPES,
	dev: false,
	page: PAGE,
	appMod: {},
	pageMod: page,
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

Bun.serve({
	port: 8080,

	fetch: async request => {
		const hint = new NextRequestHint({
			init: request,
			input: request,
			page: PAGE,
		});

		return render(hint);
	},
});
