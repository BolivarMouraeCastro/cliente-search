import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  // Explicitly pass server-side env vars to runtime
  serverRuntimeConfig: {
    ADMIN_REFRESH_TOKEN: process.env.ADMIN_REFRESH_TOKEN,
    PERICIA_REFRESH_TOKEN: process.env.PERICIA_REFRESH_TOKEN,
  },
};

export default nextConfig;
