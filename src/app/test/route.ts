export const GET = async (request: Request) => {
	console.log(new Error().stack);

	return new Response('Hello, World!', {
		status: 200,
		headers: {
			'content-type': 'text/plain',
		},
	});
};
