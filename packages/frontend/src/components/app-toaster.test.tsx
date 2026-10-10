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
});
