import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ERROR_REVERT_MS,
  StatusAnnouncer,
  SUCCESS_REVERT_MS,
  useActionStatus,
} from "./action-feedback.tsx";

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

describe("StatusAnnouncer", () => {
  it("adds no live region while there is nothing to announce", () => {
    // Radix hides everything outside an open dialog one element at a time around every live
    // region on the page, so a list with one per row made dialogs take seconds to open.
    const { container } = render(
      <>
        {Array.from({ length: 50 }, (_, i) => (
          <StatusAnnouncer key={i} message={null} />
        ))}
      </>,
    );
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(0);
  });

  it("announces its message politely", () => {
    const { rerender } = render(<StatusAnnouncer message={null} />);
    rerender(<StatusAnnouncer message="Copied TSK-1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Copied TSK-1");
    rerender(<StatusAnnouncer message={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
