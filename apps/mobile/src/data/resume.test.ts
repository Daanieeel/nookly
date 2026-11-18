import { type AppStateLike, resumeWhenActive } from "./resume.ts";

/// The parts of React Native's `AppState` the phone listens to, driven by the test.
function fakeAppState() {
  const listeners: ((state: string) => void)[] = [];
  const appState: AppStateLike = {
    addEventListener: (_type, listener) => {
      listeners.push(listener);
      return { remove: () => listeners.splice(listeners.indexOf(listener), 1) };
    },
  };
  return { appState, change: (state: string) => listeners.forEach((l) => l(state)), listeners };
}

// iOS closes the app's connections while it is in the background. Back in front, the phone
// syncs and reopens its live channels at once instead of waiting out a retry.
describe("the phone coming back to the front", () => {
  it("syncs when the app is active again", () => {
    const sync = { resume: jest.fn() };
    const { appState, change } = fakeAppState();
    resumeWhenActive(sync, appState);
    change("background");
    expect(sync.resume).not.toHaveBeenCalled();
    change("active");
    expect(sync.resume).toHaveBeenCalledTimes(1);
  });

  it("listens to nothing once stopped", () => {
    const sync = { resume: jest.fn() };
    const { appState, change, listeners } = fakeAppState();
    resumeWhenActive(sync, appState)();
    change("active");
    expect(sync.resume).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });
});
