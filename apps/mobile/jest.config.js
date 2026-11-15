const path = require("node:path");

module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.ts"],
  setupFilesAfterEnv: ["./jest.after.ts"],
  // Worklets' own stand in, so Reanimated (the sidebar's drawer) runs without native code.
  moduleNameMapper: {
    "^expo-sqlite/kv-store$": path.join(__dirname, "src/test/kv-store.ts"),
    "^isomorphic-webcrypto/src/react-native$": path.join(__dirname, "src/shims/webcrypto.js"),
    "^react-native-worklets$": path.join(
      path.dirname(require.resolve("react-native-worklets/package.json")),
      "src/mock.ts",
    ),
  },
  // Reanimated's animation loop (driven by the calendar's swipe test) outlives a test and
  // keeps the process from ending on its own, though every test has passed.
  forceExit: true,
  // A screen test renders the whole app and drives it through several sheets: about a second
  // here, five or more on a CI runner, where Jest's 5 second default failed them at random.
  // The timeout is there to catch a hang, not to time the app.
  testTimeout: 30_000,
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@tabler/.*|react-native-svg|@nookly/.*|blobatar|@blobatar/.*|standard-navigation))",
  ],
};
