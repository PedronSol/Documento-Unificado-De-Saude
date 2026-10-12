import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "@/next.config.mjs";


describe("next.config rewrites", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("proxies /api to API_PROXY_TARGET without its trailing slash", async () => {
    vi.stubEnv("API_PROXY_TARGET", "https://api.example.com/");

    await expect(nextConfig.rewrites()).resolves.toEqual([
      { source: "/api/:path*", destination: "https://api.example.com/:path*" },
    ]);
  });

  it.each([undefined, ""])("declares no rewrite when the target is %j", async (target) => {
    vi.stubEnv("API_PROXY_TARGET", target);

    await expect(nextConfig.rewrites()).resolves.toEqual([]);
  });

  it("lets a 10 MiB multipart upload through the proxy", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe("11mb");
  });

  it("rejects a target without http or https", async () => {
    vi.stubEnv("API_PROXY_TARGET", "dus-backend.up.railway.app");

    await expect(nextConfig.rewrites()).rejects.toThrow(
      "API_PROXY_TARGET deve começar com http:// ou https://",
    );
  });
});
