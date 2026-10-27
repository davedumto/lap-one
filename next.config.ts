import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Content-addressed by filename in practice (the car model, fonts fallback,
        // audio clip): safe to cache for a year since a changed asset ships under a
        // new deploy anyway, and Vercel's edge network revalidates on new deploys.
        source: "/models/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/audio/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
