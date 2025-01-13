import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
	output: 'standalone',
	swcMinify: false,
	typescript: {
		ignoreBuildErrors: true,
	},
};

export default nextConfig;
