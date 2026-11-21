import { withStallGuard } from "./stall-guard.ts";

// Downloads sat on "Downloading from your account" for fifteen minutes: one request that
// never finished held up every file behind it. A transfer that stops moving is given up on.
describe("a transfer that may stall", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("finishes with what the transfer returns", async () => {
    const result = withStallGuard(
      () => ({ done: Promise.resolve("file"), cancel: () => {} }),
      1000,
    );
    await expect(result).resolves.toBe("file");
  });

  it("is cancelled and fails when nothing moves for too long", async () => {
    const cancel = jest.fn();
    const result = withStallGuard(() => ({ done: new Promise<string>(() => {}), cancel }), 1000);
    const failed = expect(result).rejects.toThrow("stalled");
    jest.advanceTimersByTime(1000);
    await failed;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting while bytes keep arriving", async () => {
    const cancel = jest.fn();
    let alive: () => void = () => {};
    let finish: (value: string) => void = () => {};
    const result = withStallGuard((touch) => {
      alive = touch;
      return {
        done: new Promise<string>((resolve) => {
          finish = resolve;
        }),
        cancel,
      };
    }, 1000);
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(800);
      alive();
    }
    expect(cancel).not.toHaveBeenCalled();
    finish("big file");
    await expect(result).resolves.toBe("big file");
  });

  it("passes a failed transfer's error on", async () => {
    const result = withStallGuard(
      () => ({ done: Promise.reject(new Error("The server answered 500.")), cancel: () => {} }),
      1000,
    );
    await expect(result).rejects.toThrow("The server answered 500.");
  });
});
