import type { MigrationState } from "@nookly/shared/sync";
import { renderScreens, testData } from "../test/render.tsx";
import { FirstSyncPage } from "../shell/FirstSyncPage.tsx";
import { ForgotScreen, SignInScreen, SignUpScreen, WelcomeScreen } from "./AccountScreens.tsx";

const TABLET = { width: 1032 };
const PORTRAIT_MINI = { width: 744, height: 1133 };

// On a tablet the first run and signing in are the desktop's account dialog and first sync
// dialog: centred cards over the app, never phone pages stretched across the window (1.11).
describe("signing in on a tablet", () => {
  it("welcomes on a centred card over the app's background", async () => {
    for (const window of [TABLET, PORTRAIT_MINI]) {
      const screen = await renderScreens(
        { index: () => <WelcomeScreen /> },
        testData(),
        "/",
        window,
      );
      expect(await screen.findByTestId("welcome-card")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Create Account" })).toBeTruthy();
      screen.unmount();
    }
  });

  it("signs in, signs up and resets a password in a dialog titled for it", async () => {
    for (const [Page, title] of [
      [SignInScreen, "Welcome back"],
      [SignUpScreen, "Create your account"],
      [ForgotScreen, "Reset your password"],
    ] as const) {
      const screen = await renderScreens({ index: () => <Page /> }, testData(), "/", TABLET);
      expect(await screen.findByTestId("sheet-dialog")).toBeTruthy();
      expect(screen.getAllByText(title)).toHaveLength(1);
      screen.unmount();
    }
  });

  it("brings the tablet into the account on a card over the dimmed app", async () => {
    const data = testData();
    const migration: MigrationState = {
      phase: "sending",
      items: 10,
      itemsSent: 4,
      files: 0,
      filesSent: 0,
      backupPath: "/backups/b.zip",
      startedAt: "2026-10-14T10:00:00.000Z",
      finishedAt: null,
      error: null,
    };
    data.sync.store.setState({ migration });
    const screen = await renderScreens({ index: () => <FirstSyncPage /> }, data, "/", TABLET);
    expect(await screen.findByText("Bringing this tablet into your account")).toBeTruthy();
    expect(screen.getByTestId("first-sync-card")).toBeTruthy();
  });

  it("keeps the phone's pages on a phone", async () => {
    const screen = await renderScreens({ index: () => <SignInScreen /> });
    expect(await screen.findByText("Welcome back")).toBeTruthy();
    expect(screen.queryByTestId("sheet-dialog")).toBeNull();
    screen.unmount();
    const welcome = await renderScreens({ index: () => <WelcomeScreen /> });
    expect(welcome.queryByTestId("welcome-card")).toBeNull();
  });
});
