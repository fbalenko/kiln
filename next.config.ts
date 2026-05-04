import type { NextConfig } from "next";
import path from "node:path";

const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  // Pin the workspace root to this repo. A stray ~/package.json otherwise
  // pulls Next's root-detection up to the parent and breaks module resolution
  // (e.g. "Can't resolve 'tailwindcss' in '/Users/<user>/Desktop'").
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  // Native sqlite bindings can't be bundled by Turbopack/webpack.
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
};

export default nextConfig;
