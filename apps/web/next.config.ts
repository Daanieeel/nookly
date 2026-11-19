import type { NextConfig } from "next";

// A static site: every page is HTML at build time, served by Cloudflare Pages. Data that
// changes (the latest release, stars, the server's status) is read at build time and
// refreshed in the browser.
const config: NextConfig = {
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
  transpilePackages: ["@nookly/ui", "@nookly/frontend"],
  // `bun run typecheck` checks the types; TypeScript 7 has no API for Next to call.
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  reactStrictMode: true,
  // The repo's own AGENTS.md is the only one; `next dev` would write another here.
  agentRules: false,
  // Two root layouts (English and German) leave no single one for a 404 page.
  experimental: { globalNotFound: true },
};

export default config;
