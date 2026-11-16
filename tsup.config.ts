import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "es2020",
  dts: true,
  clean: true,
  sourcemap: true,
  // Next.js App Router: every component here uses browser APIs, so the whole
  // package is a client boundary.
  banner: { js: '"use client";' },
  external: ["react", "react-dom", "@relyvolabs/web-sdk", "livekit-client"],
});
