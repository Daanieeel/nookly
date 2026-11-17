import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resumeWhenBack } from "./resume-when-back.ts";

// The desktop finds the server again as soon as it can: when the network returns, when
// the window shows again and when the computer wakes from sleep, instead of waiting out a
// retry drawn while the server was away.
describe("coming back", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("syncs when the network returns", () => {
    const sync = { resume: vi.fn() };
    const stop = resumeWhenBack(sync);
    window.dispatchEvent(new Event("online"));
    expect(sync.resume).toHaveBeenCalledOnce();
    stop();
  });

  it("syncs when the window shows again", () => {
    const sync = { resume: vi.fn() };
    const stop = resumeWhenBack(sync);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.visibilityState).toBe("visible");
    expect(sync.resume).toHaveBeenCalledOnce();
    stop();
  });

  it("syncs when the computer wakes, told by the clock jumping ahead", async () => {
    const sync = { resume: vi.fn() };
    const stop = resumeWhenBack(sync);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync.resume).not.toHaveBeenCalled();
    // Asleep: timers stand still while the clock moves on.
    vi.setSystemTime(Date.now() + 10 * 60_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sync.resume).toHaveBeenCalledOnce();
    stop();
  });

  it("listens to nothing once stopped", () => {
    const sync = { resume: vi.fn() };
    resumeWhenBack(sync)();
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sync.resume).not.toHaveBeenCalled();
  });
});
