import {BaseNextRequest, type FetchMetric} from 'next/dist/server/base-http';
import {NextRequest} from 'next/server';

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

	public toNextRequest(): NextRequest {
		return new NextRequest(this.request);
	}
}
