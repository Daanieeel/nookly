import type { NextConfig } from "next";

// A development tool: `bun run dev:components` serves it, nothing deploys it. `build` makes a
// static copy of the gallery that can be hosted anywhere.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@nookly/ui", "@nookly/frontend"],
  // `bun run typecheck` checks the types; TypeScript 7 has no API for Next to call.
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  reactStrictMode: true,
  // The repo's own AGENTS.md is the only one; `next dev` would write another here.
  agentRules: false,
};

export default config;
