import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	experimental: {
		externalDir: true,
	},
	// webpack: (config, { isServer }) => {
	// 	if (isServer) {
	// 		config.externals.push("react", "react-dom");
	// 	}

	// 	return config;
	// },
};

export default nextConfig;
