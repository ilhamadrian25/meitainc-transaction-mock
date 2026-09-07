import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mock server: jangan pernah cache response supaya rule selalu dievaluasi ulang.
  headers: async () => [
    {
      source: "/api/:path*",
      headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
    },
  ],
};

export default nextConfig;
