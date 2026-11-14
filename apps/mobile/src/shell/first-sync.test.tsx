import type { MigrationState } from "@nookly/shared/sync";
import { act, fireEvent } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { FirstSyncPage } from "./FirstSyncPage.tsx";

const BASE: MigrationState = {
  phase: "sending",
  items: 1204,
  itemsSent: 400,
  files: 37,
  filesSent: 12,
  backupPath: "/backups/b.zip",
  startedAt: "2026-10-14T10:00:00.000Z",
  finishedAt: null,
  error: null,
};

describe("bringing this phone into an account", () => {
  // Was only a line in Settings, Account: now a page over everything until it is done.
  it("covers the app while it runs, with how far it got and no way to close it", async () => {
    const data = testData();
    data.sync.store.setState({ migration: BASE });
    const screen = await renderScreens({ index: () => <FirstSyncPage /> }, data);
    expect(await screen.findByText("Bringing this phone into your account")).toBeTruthy();
    expect(screen.getByText("Backed up this phone")).toBeTruthy();
    expect(screen.getByText("400 of 1,204 items")).toBeTruthy();
    expect(screen.getByText("12 of 37 files")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Items sent" })).toHaveAccessibilityValue({
      now: 400,
      max: 1204,
    });
    for (const name of ["Done", "Close", "Try Again", "Cancel"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("says when it is done, and goes away on Done", async () => {
    const data = testData();
    data.sync.store.setState({ migration: BASE });
    const screen = await renderScreens({ index: () => <FirstSyncPage /> }, data);
    await screen.findByText("Bringing this phone into your account");
    act(() =>
      data.sync.store.setState({
        migration: { ...BASE, phase: "done", itemsSent: 1204, filesSent: 37 },
      }),
    );
    expect(
      await screen.findByText(
        "All 1,204 items and 37 files are in your account, checked with the server.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("Bringing this phone into your account")).toBeNull();
  });

  it("explains a failure and tries again on request", async () => {
    const data = testData();
    const retry = jest.spyOn(data.sync, "retryFirstSync").mockResolvedValue();
    data.sync.store.setState({ migration: BASE });
    const screen = await renderScreens({ index: () => <FirstSyncPage /> }, data);
    await screen.findByText("Bringing this phone into your account");
    act(() =>
      data.sync.store.setState({
        migration: { ...BASE, phase: "failed", itemsSent: 0, error: "The disk is full." },
      }),
    );
    expect(await screen.findByText("The disk is full.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    expect(retry).toHaveBeenCalled();
  });

  it("shows nothing when there is no first sync", async () => {
    const screen = await renderScreens({ index: () => <FirstSyncPage /> }, testData());
    expect(screen.queryByText("Bringing this phone into your account")).toBeNull();
  });
});
