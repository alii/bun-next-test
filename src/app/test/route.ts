const mycoolstack = new Error().stack;

export const GET = async (request: Request) => {
	return new Response(mycoolstack, {
		status: 200,
		headers: {
			'content-type': 'text/plain',
		},
	});
};
