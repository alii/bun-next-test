import {BaseNextResponse} from 'next/dist/server/base-http/index.js';
import {toNodeOutgoingHttpHeaders} from 'next/dist/server/web/utils.js';
import {CloseController, trackBodyConsumed} from 'next/dist/server/web/web-on-close.js';
import {OutgoingHttpHeaders} from 'node:http';
import {deferred} from '../util.ts';

export class BunNextResponse extends BaseNextResponse<WritableStream> {
	private headers = new Headers();
	private textBody: string | undefined = undefined;

	// Hack because Next.js uses `.originalResponse` to patch res.setHeader support when it thinks we are using Node.js
	// because the check for Node.js is actually terrible and doesn't actually check the response is a Node.js response at all
	get originalResponse() {
		return this;
	}

	private readonly closeController = new CloseController();

	public statusCode: number | undefined;
	public statusMessage: string | undefined;

	private readonly transformStream: TransformStream;

	public constructor() {
		const transformStream = new TransformStream();

		super(transformStream.writable);
		this.transformStream = transformStream;
	}

	public get writable() {
		return this.transformStream.writable;
	}

	public get readable() {
		return this.transformStream.readable;
	}

	public setHeader(name: string, value: string | string[]): this {
		this.headers.delete(name);

		for (const val of Array.isArray(value) ? value : [value]) {
			this.headers.append(name, val);
		}

		return this;
	}

	public removeHeader(name: string): this {
		this.headers.delete(name);
		return this;
	}

	public getHeaderValues(name: string): string[] | undefined {
		// https://developer.mozilla.org/docs/Web/API/Headers/get#example
		return this.getHeader(name)
			?.split(',')
			.map(v => v.trimStart());
	}

	public getHeader(name: string): string | undefined {
		return this.headers.get(name) ?? undefined;
	}

	public getHeaders(): OutgoingHttpHeaders {
		return toNodeOutgoingHttpHeaders(this.headers);
	}

	public getNormalHeaders() {
		return this.headers;
	}

	public hasHeader(name: string): boolean {
		return this.headers.has(name);
	}

	public appendHeader(name: string, value: string): this {
		this.headers.append(name, value);
		return this;
	}

	public body(value: string) {
		this.textBody = value;
		return this;
	}

	private readonly sendPromise = deferred<void>();

	public send() {
		this.sendPromise.resolve();
	}

	get sent() {
		return this.sendPromise.status !== 'pending';
	}

	public async toResponse() {
		await this.sendPromise;

		const body = this.textBody ?? this.transformStream.readable;

		let bodyInit: BodyInit = body;

		// if the response is streaming, onClose() can still be called after this point.
		const canAddListenersLater = typeof bodyInit !== 'string';
		const shouldTrackBody = canAddListenersLater || this.closeController.listeners > 0;

		if (shouldTrackBody) {
			bodyInit = trackBodyConsumed(body, () => {
				this.closeController.dispatchClose();
			});
		}

		return new Response(bodyInit, {
			headers: this.headers,
			status: this.statusCode,
			statusText: this.statusMessage,
		});
	}

	public onClose(callback: () => void) {
		if (this.closeController.isClosed) {
			throw new Error('Cannot call onClose on a WebNextResponse that is already closed');
		}

		return this.closeController.onClose(callback);
	}
}
