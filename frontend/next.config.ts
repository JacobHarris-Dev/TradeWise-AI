import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.127"],
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
