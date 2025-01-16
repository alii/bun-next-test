import {fileURLToPath} from 'node:url';
import {conf} from './.tmp/conf';
import {BunNextServer} from '/Users/ali/code/next.js/packages/next/src/server/bun-server';

const server = await BunNextServer.start({
	conf,
	dir: fileURLToPath(new URL('./.next/bun', import.meta.url)),
	port: 3000,
	hostname: 'localhost',
});

console.log(server.url.toString());
