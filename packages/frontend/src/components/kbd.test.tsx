import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.resetModules());

async function renderKbd(userAgent: string) {
  vi.stubGlobal("navigator", { ...navigator, userAgent });
  const { Kbd } = await import("./kbd.tsx");
  render(<Kbd>⌘</Kbd>);
}

describe("Kbd", () => {
  it("shows Ctrl off a Mac", async () => {
    await renderKbd("Mozilla/5.0 (X11; Fedora; Linux x86_64)");
    expect(screen.getByText("Ctrl")).toBeInTheDocument();
  });

  it("shows the command symbol on a Mac", async () => {
    await renderKbd("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    expect(screen.getByText("⌘")).toBeInTheDocument();
  });
});
