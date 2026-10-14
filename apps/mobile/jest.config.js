const path = require("node:path");

module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.ts"],
  // Worklets' own stand in, so Reanimated (the sidebar's drawer) runs without native code.
  moduleNameMapper: {
    "^react-native-worklets$": path.join(
      path.dirname(require.resolve("react-native-worklets/package.json")),
      "src/mock.ts",
    ),
  },
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@tabler/.*|react-native-svg|@nookly/.*|standard-navigation))",
  ],
};
