import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Produces .next/standalone with its own minimal server.js and only the
  // traced node_modules. Required by the runtime stage of the Dockerfile,
  // which copies that folder rather than installing dependencies again.
  // See node_modules/next/dist/docs/.../config/01-next-config-js/output.md
  output: "standalone",
};

export default nextConfig;
