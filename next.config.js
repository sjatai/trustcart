/** @type {import('next').NextConfig} */
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

function ensureCssPlugin(config) {
  if (!config.plugins) return;
  const hasPlugin = config.plugins.some((plugin) => plugin instanceof MiniCssExtractPlugin);
  if (!hasPlugin) {
    config.plugins.push(new MiniCssExtractPlugin());
  }
}

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  webpack(config) {
    ensureCssPlugin(config);
    return config;
  },
};

module.exports = nextConfig;


