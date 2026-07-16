/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Same-origin /api/* proxies to the Fastify API so the browser needs no CORS.
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
