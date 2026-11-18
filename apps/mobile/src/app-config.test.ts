import config from "../app.json";

const ios = config.expo.ios;

// What the App Store asks of every build (export compliance, the privacy manifest), kept in
// the app's config so EAS writes it into each build.
describe("the iOS app's declarations", () => {
  it("uses only the system's standard encryption (HTTPS), so no export documents", () => {
    expect(ios.config?.usesNonExemptEncryption).toBe(false);
  });

  it("names why it uses each API Apple asks a reason for", () => {
    const types = ios.privacyManifests?.NSPrivacyAccessedAPITypes ?? [];
    expect(types.map((t) => t.NSPrivacyAccessedAPIType).sort()).toEqual([
      "NSPrivacyAccessedAPICategoryDiskSpace",
      "NSPrivacyAccessedAPICategoryFileTimestamp",
      "NSPrivacyAccessedAPICategorySystemBootTime",
      "NSPrivacyAccessedAPICategoryUserDefaults",
    ]);
    for (const type of types)
      expect(type.NSPrivacyAccessedAPITypeReasons.length).toBeGreaterThan(0);
  });

  it("tracks nobody, and says what an account keeps on the server", () => {
    expect(ios.privacyManifests?.NSPrivacyTracking).toBe(false);
    const kept = ios.privacyManifests?.NSPrivacyCollectedDataTypes ?? [];
    expect(kept.map((k) => k.NSPrivacyCollectedDataType)).toEqual(
      expect.arrayContaining([
        "NSPrivacyCollectedDataTypeEmailAddress",
        "NSPrivacyCollectedDataTypeUserID",
        "NSPrivacyCollectedDataTypeOtherUserContent",
      ]),
    );
    for (const k of kept) {
      expect(k.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(k.NSPrivacyCollectedDataTypePurposes).toEqual([
        "NSPrivacyCollectedDataTypePurposeAppFunctionality",
      ]);
    }
  });
});
