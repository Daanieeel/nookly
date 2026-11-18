// Expo finds the monorepo on its own: workspace packages resolve from the root, and
// `packages/shared` is TypeScript Metro compiles like the app's own files. NativeWind
// turns the Tailwind classes, the desktop's own (`src/global.css`), into native styles.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Yjs wants `isomorphic-webcrypto`; the phone's `expo-crypto` does the job (`src/shims`).
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === "isomorphic-webcrypto/src/react-native") {
    return { type: "sourceFile", filePath: path.join(__dirname, "src/shims/webcrypto.js") };
  }
  return (upstream ?? context.resolveRequest)(context, name, platform);
};

// A rem of 16, as on the desktop, so `h-9` or `text-sm` is the same size on both.
module.exports = withNativewind(config, { inlineRem: 16 });
