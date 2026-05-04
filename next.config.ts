import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this repo — silences the multi-lockfile warning
    // when an unrelated package-lock.json sits in a parent directory.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
