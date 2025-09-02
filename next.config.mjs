/** @type {import('next').NextConfig} */
const nextConfig = {
  // CI-only safety net. Remove once you want strict builds.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
