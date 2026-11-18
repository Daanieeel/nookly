import Storage from "expo-sqlite/kv-store";
import { AppState } from "react-native";
import { saveWorkspaceNow, useWorkspace, workspace } from "./workspace-store.ts";

const saved = () => JSON.parse(Storage.getItemSync("nookly.shell.workspace") ?? "null");

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  saveWorkspaceNow();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// The tabs were written to the device's storage, whole, in the middle of every tap that
// opened or focused something.
describe("remembering the tablet's tabs", () => {
  it("saves after the step, not during it", () => {
    const setItem = jest.spyOn(Storage, "setItemSync");
    workspace.open("/calendar?saved=later", "here");
    expect(setItem).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(saved())).toContain("/calendar?saved=later");
  });

  it("saves several steps in a row once", () => {
    const setItem = jest.spyOn(Storage, "setItemSync");
    workspace.open("/trash?step=1", "here");
    workspace.open("/trash?step=2", "here");
    workspace.back();
    jest.runOnlyPendingTimers();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(saved().layout).toEqual(useWorkspace.getState().ws.layout);
  });

  it("saves at once when the app goes to the background", () => {
    workspace.open("/pinned?leaving=1", "here");
    const listener = jest.mocked(AppState.addEventListener).mock.calls.at(-1)?.[1];
    listener?.("background");
    expect(JSON.stringify(saved())).toContain("/pinned?leaving=1");
  });
});
