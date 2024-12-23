import { NextRequest } from "next/server";

export const GET = async (request: NextRequest) => {
	const text = JSON.stringify(Object.fromEntries(request.nextUrl.searchParams.entries()));

	return new Response(text, {
		status: 200,
		headers: {
			"content-type": "application/json",
		},
	});
};
