import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { Rich } from "./Rich.tsx";

describe("Rich", () => {
  it("draws bold, italic and code", () => {
    renderWithProviders(<Rich text="A **bold** and *soft* word with `code`." />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("soft").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
  });

  it("shows a shortcut in code the way this system writes it", () => {
    renderWithProviders(<Rich text="Press `Mod+Shift+J`." />);
    expect(screen.getByText(/J$/, { selector: "code" })).toBeTruthy();
    expect(screen.queryByText("Mod+Shift+J")).toBeNull();
  });

  it("draws bullet lines as a list", () => {
    renderWithProviders(<Rich text={"- one\n- **two**"} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("two").tagName).toBe("STRONG");
  });

  it("opens a web link in the browser and leaves other links as text", async () => {
    mockCommand("plugin:opener|open_url", null);
    const { user } = renderWithProviders(
      <Rich text="See [the docs](https://nookly.dev/docs) or [odd](javascript:alert(1))." />,
    );
    await user.click(screen.getByRole("link", { name: "the docs" }));
    expect(callsOf("plugin:opener|open_url")).toEqual([
      expect.objectContaining({ url: "https://nookly.dev/docs" }),
    ]);
    expect(screen.queryByRole("link", { name: "odd" })).toBeNull();
    expect(screen.getByText(/odd/)).toBeTruthy();
  });

  // Each line of notes used to mount a whole note editor, which made the history dialog
  // slow to open.
  it("does not mount a note editor", () => {
    const { container } = renderWithProviders(<Rich text="A **line**." />);
    expect(container.querySelector(".ProseMirror")).toBeNull();
  });
});
