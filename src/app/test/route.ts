export const GET = async (request: Request) => {
	console.log(new Error().stack);
	console.log('cool');

	return new Response('Hello, World!', {
		status: 200,
		headers: {
			'content-type': 'text/plain',
		},
	});
};
