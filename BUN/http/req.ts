import {BaseNextRequest, type FetchMetric} from 'next/dist/server/base-http/index.js';

export class BunNextRequest extends BaseNextRequest<ReadableStream<Uint8Array> | null> {
	private readonly request: Request;

	public readonly fetchMetrics: FetchMetric[] | undefined;

	constructor(url: URL, request: Request) {
		super(request.method, request.url, request.body);
		this.request = request;
		this.url = url.pathname;
	}

	public get headers() {
		return Object.fromEntries([...this.request.headers.entries()]);
	}
}
