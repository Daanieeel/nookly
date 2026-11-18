// Yjs (through lib0) asks for `isomorphic-webcrypto`, a package for React Native that
// is no longer maintained. The phone already has what it uses for ids: `expo-crypto`.
// Metro (`metro.config.js`) and Jest (`jest.config.js`) point that import here.
const { getRandomValues } = require("expo-crypto");

const webcrypto = {
  ensureSecure() {},
  getRandomValues,
  subtle: undefined,
};

module.exports = { default: webcrypto, ...webcrypto };
