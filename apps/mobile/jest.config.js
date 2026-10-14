module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@tabler/.*|react-native-svg|@nookly/.*|standard-navigation))",
  ],
};
