const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  // Turbopack is enabled by default in Next.js 16, but we need webpack config for externalization
  // Adding empty turbopack config to silence the warning about having webpack config without turbopack
  turbopack: {},
  // Skip static optimization - all pages are dynamic
  skipTrailingSlashRedirect: true,
  // Mark server-only packages as external to prevent client-side bundling
  // This ensures they use Node.js modules (including Node.js fetch) instead of browser polyfills
  // Note: In Next.js 15+, this option was renamed from serverComponentsExternalPackages
  serverExternalPackages: [
    "@knowledgeplane/db",
    "@knowledgeplane/db/next",
    "arangojs",
  ],
  webpack: (config, { isServer, webpack }) => {
    // For server-side bundles, ensure Node.js modules are used
    if (isServer) {
      // Explicitly externalize db package and arangojs to prevent bundling
      // This ensures they use Node.js modules (including Node.js fetch) instead of browser polyfills
      config.externals = config.externals || [];

      // Externalize the db package and arangojs as CommonJS modules
      config.externals.push({
        "@knowledgeplane/db": "commonjs @knowledgeplane/db",
        "@knowledgeplane/db/next": "commonjs @knowledgeplane/db/next",
        arangojs: "commonjs arangojs",
      });

      // Don't polyfill Node.js modules for server-side code
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },
  // Skip static generation for error pages
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
};

module.exports = nextConfig;
