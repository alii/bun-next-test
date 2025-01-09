export function deferred<T, Reject = Error>() {
	let resolve: (value: T) => void;
	let reject: (reason: Reject) => void;

	let status: 'pending' | 'resolved' | 'rejected' = 'pending';

	const promise = new Promise<T>((res, rej) => {
		resolve = value => {
			status = 'resolved';
			res(value);
		};

		reject = value => {
			status = 'rejected';
			rej(value);
		};
	});

	return {
		then: async <NextT>(cb: (value: T) => PromiseLike<NextT>) => promise.then(cb),
		catch: async <NextT>(cb: (value: T) => PromiseLike<NextT>) => promise.catch(cb),
		resolve: resolve!,
		reject: reject!,
		get status() {
			return status;
		},
	};
}
