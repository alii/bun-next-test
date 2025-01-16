import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
	output: 'bun',

	typescript: {
		ignoreBuildErrors: true,
	},
};

export default nextConfig;
