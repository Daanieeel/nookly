import path from "node:path";
import type { NextConfig } from "next";

const shim = (name: string) => path.join(import.meta.dirname, "src/rn", name);

// A development tool: `bun run dev:components` serves it, nothing deploys it. `build` makes a
// static copy of the gallery that can be hosted anywhere.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  transpilePackages: [
    "@nookly/ui",
    "@nookly/frontend",
    "@tabler/icons-react-native",
    "react-native-svg",
    "react-native-reanimated",
    "react-native-worklets",
    "react-native-gesture-handler",
  ],
  // `bun run typecheck` checks the types; TypeScript 7 has no API for Next to call.
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  reactStrictMode: true,
  // The repo's own AGENTS.md is the only one; `next dev` would write another here.
  agentRules: false,
  // The phone's components run in the browser through react-native-web. The packages and
  // the app's own source are compiled where they are, outside this folder.
  experimental: { externalDir: true },
  webpack(webpackConfig, { webpack, dev }) {
    // React Native code asks for this global.
    webpackConfig.plugins.push(
      new webpack.DefinePlugin({ __DEV__: JSON.stringify(dev), global: "globalThis" }),
    );
    webpackConfig.resolve.extensions = [
      ".web.tsx",
      ".web.ts",
      ".web.js",
      ...webpackConfig.resolve.extensions,
    ];
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      "@mobile": path.join(import.meta.dirname, "../mobile/src"),
      // The frontend package's own `#/` imports, which webpack does not resolve itself.
      "#": path.join(import.meta.dirname, "../../packages/frontend/src"),
      "react-native$": shim("react-native.tsx"),
      expo$: shim("expo.ts"),
      "expo-sqlite/kv-store": shim("expo-sqlite-kv-store.ts"),
      "react-native-reanimated$": shim("react-native-reanimated.tsx"),
      "react-native-gesture-handler$": shim("react-native-gesture-handler.tsx"),
      "expo-blur$": shim("expo-blur.tsx"),
      "react-native-safe-area-context$": shim("react-native-safe-area-context.tsx"),
      nativewind$: shim("nativewind.ts"),
      "expo-clipboard$": shim("expo-misc.ts"),
      "expo-router$": shim("expo-misc.ts"),
    };
    return webpackConfig;
  },
};

export default config;
