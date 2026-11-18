import { renderScreens, testData } from "../test/render.tsx";
import { AccountPage } from "../screens/settings/AccountPage.tsx";
import { BackupPage } from "../screens/settings/BackupPage.tsx";
import { SettingsScreen } from "../screens/SettingsScreen.tsx";
import { deviceWord } from "./device-word.ts";

/// Text that names the device someone holds as a phone.
const PHONE = /\b(this|the|new) phone\b/i;

describe("the device's name in copy", () => {
  it("is Apple's name on iOS and the plain word on Android", () => {
    expect(deviceWord(false, "ios")).toBe("iPhone");
    expect(deviceWord(true, "ios")).toBe("iPad");
    expect(deviceWord(false, "android")).toBe("phone");
    expect(deviceWord(true, "android")).toBe("tablet");
  });

  // An iPad's Backup, Account and Settings said "this phone" (11.1).
  it("never names a phone on a tablet", async () => {
    for (const page of [
      () => <BackupPage />,
      () => <AccountPage />,
      () => <SettingsScreen initial="backup" />,
    ]) {
      const screen = await renderScreens({ index: page }, testData(), "/", { width: 1194 });
      expect(await screen.findAllByText(/\biPad\b/)).not.toHaveLength(0);
      expect(screen.queryAllByText(PHONE)).toEqual([]);
      screen.unmount();
    }
  });

  it("names the iPhone on an iPhone", async () => {
    const screen = await renderScreens({ index: () => <BackupPage /> }, testData(), "/", {
      width: 390,
    });
    expect(await screen.findByText("A backup of this iPhone")).toBeTruthy();
    expect(screen.queryAllByText(PHONE)).toEqual([]);
  });
});
