export default async function PageWithParams({params}: {params: Promise<{param: string}>}) {
	return <pre>{JSON.stringify(await params, null, 2)} hi</pre>;
}
