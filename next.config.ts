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
  // Native sqlite bindings can't be bundled by Turbopack/webpack. pdfkit is
  // also externalized — its .afm font metric files are read from disk via
  // fs.readFileSync at runtime and do not survive the webpack bundle.
  //
  // sqlite-vec resolves its platform-specific binary at runtime via
  // `import.meta.resolve("sqlite-vec-linux-x64/vec0.so")`. The bundler can't
  // statically discover that lookup, so the binary package itself has to be
  // listed here AND its node_modules path force-traced into the function
  // archive (see outputFileTracingIncludes below).
  serverExternalPackages: [
    "better-sqlite3",
    "sqlite-vec",
    "sqlite-vec-linux-x64",
    "pdfkit",
  ],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/sqlite-vec/**/*",
      "./node_modules/sqlite-vec-linux-x64/**/*",
    ],
    "/deals/**/*": [
      "./node_modules/sqlite-vec/**/*",
      "./node_modules/sqlite-vec-linux-x64/**/*",
    ],
    "/pipeline": [
      "./node_modules/sqlite-vec/**/*",
      "./node_modules/sqlite-vec-linux-x64/**/*",
    ],
    "/": [
      "./node_modules/sqlite-vec/**/*",
      "./node_modules/sqlite-vec-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
