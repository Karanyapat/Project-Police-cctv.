import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true, // ปิดการ lint ระหว่าง build
  },

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5000/api/:path*', // proxy ไปยัง API server
      },
    ];
  },
};

export default nextConfig;