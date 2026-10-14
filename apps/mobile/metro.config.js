// Expo finds the monorepo on its own: workspace packages resolve from the root, and
// `packages/shared` is TypeScript Metro compiles like the app's own files.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
