/// How long a transfer may go without a single byte moving before it counts as stalled.
export const STALL_MS = 30_000;

/// Runs a transfer that reports its progress, and gives up on it when nothing has moved for
/// `idleMs`: the connection was lost while the phone slept, or the server stopped answering.
/// Without this a download that never finishes holds up every file behind it for good.
/// `start` begins the transfer and is handed what to call on each sign of life; it returns the
/// transfer's promise and how to cancel it.
export function withStallGuard<T>(
  start: (alive: () => void) => { done: Promise<T>; cancel: () => void },
  idleMs: number = STALL_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        transfer.cancel();
        reject(new Error("The download stalled. It will be tried again."));
      }, idleMs);
    };
    const transfer = start(arm);
    arm();
    transfer.done.then(
      (value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
