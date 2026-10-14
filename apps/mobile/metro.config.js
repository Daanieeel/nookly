// Expo finds the monorepo on its own: workspace packages resolve from the root, and
// `packages/shared` is TypeScript Metro compiles like the app's own files. NativeWind
// turns the Tailwind classes, the desktop's own (`src/global.css`), into native styles.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

// A rem of 16, as on the desktop, so `h-9` or `text-sm` is the same size on both.
module.exports = withNativewind(getDefaultConfig(__dirname), { inlineRem: 16 });
