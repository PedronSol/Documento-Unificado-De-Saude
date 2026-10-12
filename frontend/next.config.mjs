/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    // 10 MiB document plus multipart envelope; the backend enforces the limit.
    proxyClientMaxBodySize: "11mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self)" },
        ],
      },
      {
        source: "/share",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  // Same-origin proxy keeps the session cookie first-party when the API
  // lives on another site (spec 041). Resolved at build time.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");
    if (!target) return [];
    if (!/^https?:\/\//.test(target)) {
      throw new Error("API_PROXY_TARGET deve começar com http:// ou https://");
    }
    return [{ source: "/api/:path*", destination: `${target}/:path*` }];
  },
}

export default nextConfig
