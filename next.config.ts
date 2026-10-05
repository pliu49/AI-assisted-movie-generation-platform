import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp ships native binaries; keep it out of the server bundle.
  serverExternalPackages: ["sharp"],
  // Pin the workspace root so a stray lockfile in a parent folder isn't picked up.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
