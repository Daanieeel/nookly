import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_REVERT_MS, SUCCESS_REVERT_MS, useActionStatus } from "./action-feedback.tsx";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function mutation(state: { isPending?: boolean; isSuccess?: boolean; isError?: boolean }) {
  return {
    isPending: false,
    isSuccess: false,
    isError: false,
    reset: vi.fn(),
    ...state,
  };
}

describe("useActionStatus", () => {
  it("resets a success after a moment", () => {
    const m = mutation({ isSuccess: true });
    const { result } = renderHook(() => useActionStatus(m));
    expect(result.current).toBe("success");
    act(() => void vi.advanceTimersByTime(SUCCESS_REVERT_MS));
    expect(m.reset).toHaveBeenCalledTimes(1);
  });

  it("keeps an error until the person acts again, unless asked to revert it", () => {
    const m = mutation({ isError: true });
    renderHook(() => useActionStatus(m));
    act(() => void vi.advanceTimersByTime(ERROR_REVERT_MS * 3));
    expect(m.reset).not.toHaveBeenCalled();
  });

  it("reverts an error after a while when asked to", () => {
    const m = mutation({ isError: true });
    const { result } = renderHook(() => useActionStatus(m, { revertErrors: true }));
    expect(result.current).toBe("error");
    act(() => void vi.advanceTimersByTime(ERROR_REVERT_MS - 1));
    expect(m.reset).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(m.reset).toHaveBeenCalledTimes(1);
  });
});
