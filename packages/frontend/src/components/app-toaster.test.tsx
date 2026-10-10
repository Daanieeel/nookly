import { act, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { AppToaster } from "./app-toaster.tsx";

describe("AppToaster", () => {
  beforeEach(() => {
    window.matchMedia = (media) => ({
      matches: false,
      media,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    });
    toast.dismiss();
  });

  it("gives every toast a close button", async () => {
    renderWithProviders(<AppToaster />);
    act(() => void toast("One"));
    expect(await screen.findByText("One")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /close toast/i })).toBeInTheDocument();
  });

  it("offers Clear all only when more than one toast is showing", async () => {
    const { user } = renderWithProviders(<AppToaster />);
    act(() => void toast("One"));
    await screen.findByText("One");
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
    act(() => void toast("Two"));
    const clear = await screen.findByRole("button", { name: "Clear all" });
    await user.click(clear);
    await waitFor(() => expect(screen.queryByText("One")).toBeNull());
    expect(screen.queryByText("Two")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("draws Clear all as part of the stack: a bar on the toast surface that says how many", async () => {
    renderWithProviders(<AppToaster />);
    act(() => {
      void toast("One");
      void toast("Two");
      void toast("Three");
    });
    const clear = await screen.findByRole("button", { name: "Clear all" });
    const bar = clear.closest("[data-toast-clear]");
    if (!(bar instanceof HTMLElement)) throw new Error("the Clear all bar is missing");
    expect(bar).toHaveTextContent("3 notifications");
    // The same surface as a toast, not a loose button floating over the page.
    for (const surface of ["bg-popover", "border", "rounded-2xl", "shadow-lg"]) {
      expect(bar).toHaveClass(surface);
    }
  });

  it("counts down, and goes when one is left", async () => {
    const { user } = renderWithProviders(<AppToaster />);
    act(() => {
      void toast("One");
      void toast("Two");
    });
    await screen.findByText("2 notifications");
    const close = (await screen.findAllByRole("button", { name: /close toast/i }))[0];
    if (!close) throw new Error("no close button");
    await user.click(close);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull());
  });

  it("lifts the stack above the Clear all bar without moving it sideways", async () => {
    renderWithProviders(<AppToaster />);
    const offsets = () => {
      const stack = document.querySelector("[data-sonner-toaster]");
      if (!(stack instanceof HTMLElement)) throw new Error("no toaster");
      return {
        right: stack.style.getPropertyValue("--offset-right"),
        left: stack.style.getPropertyValue("--offset-left"),
        bottom: stack.style.getPropertyValue("--offset-bottom"),
      };
    };
    act(() => void toast("One"));
    await screen.findByText("One");
    const alone = offsets();
    act(() => void toast("Two"));
    await screen.findByRole("button", { name: "Clear all" });
    const stacked = offsets();
    // Only the bottom changes, to make room for the bar.
    expect(stacked.right).toBe(alone.right);
    expect(stacked.left).toBe(alone.left);
    expect(stacked.bottom).not.toBe(alone.bottom);
  });
});
