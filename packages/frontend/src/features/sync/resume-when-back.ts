/// How often the clock is checked for a jump, and how far ahead it must be to count as the
/// computer having slept: timers stand still in sleep while the clock moves on.
const WAKE_CHECK_MS = 5_000;
const WAKE_GAP_MS = 30_000;

/// Tells `sync` the desktop is back, so it finds the server at once instead of waiting out a
/// retry drawn while it was away: when the network returns, when the window shows again and
/// when the computer wakes. Returns how to stop listening.
export function resumeWhenBack(sync: { resume(): void }): () => void {
  const resume = () => sync.resume();
  const shown = () => {
    if (document.visibilityState === "visible") sync.resume();
  };
  let last = Date.now();
  const clock = setInterval(() => {
    const now = Date.now();
    if (now - last > WAKE_GAP_MS) sync.resume();
    last = now;
  }, WAKE_CHECK_MS);
  window.addEventListener("online", resume);
  document.addEventListener("visibilitychange", shown);
  return () => {
    clearInterval(clock);
    window.removeEventListener("online", resume);
    document.removeEventListener("visibilitychange", shown);
  };
}
