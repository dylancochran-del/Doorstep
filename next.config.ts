import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          // Doorstep needs location and the camera picker; nothing else.
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=()" },
        ],
      },
      { source: "/api/(.*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
