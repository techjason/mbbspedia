import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  enablePrerenderSourceMaps: false,
  experimental: {
    serverSourceMaps: false,
  },
  async rewrites() {
    return [
      {
        source: "/docs/:path*.mdx",
        destination: "/llms.mdx/docs/:path*",
      },
      {
        source: "/:path*.mdx",
        destination: "/llms.mdx/docs/:path*",
      },
    ];
  },
};

const withMDX = createMDX({
  // customise the config file path
  // configPath: "source.config.ts"
});

export default withMDX(config);
