/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@knowledgeplane/db', '@knowledgeplane/aimodel', '@knowledgeplane/file-processor'],
  webpack: (config, { isServer }) => {
    // Allow importing TypeScript files from packages
    if (isServer) {
      config.resolve.extensionAlias = {
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
        '.jsx': ['.tsx', '.jsx'],
      };
    }
    return config;
  },
};

module.exports = nextConfig;

