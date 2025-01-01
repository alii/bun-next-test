'use client';

// import { NextRequest } from "next/server";

import {useParams} from 'next/navigation';

// export const GET = async (request: NextRequest) => {
// 	const text = JSON.stringify(Object.fromEntries(request.nextUrl.searchParams.entries()));

// 	return new Response(text, {
// 		status: 200,
// 		headers: {
// 			"content-type": "application/json",
// 		},
// 	});
// };

export const dynamic = 'force-dynamic';

export default function PageWithParams() {
	const params = useParams();

	return <pre>{JSON.stringify(params, null, 2)}</pre>;
}
