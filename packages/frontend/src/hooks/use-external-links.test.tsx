import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { useExternalLinks } from "./use-external-links.ts";

function Probe() {
  useExternalLinks();
  return (
    <>
      <a href="https://example.com/page">Web</a>
      <a href="https://example.com/blank" target="_blank" rel="noreferrer">
        Blank
      </a>
      <a href="mailto:a@example.com">Mail</a>
      <a href="#section">Anchor</a>
      <a href="nookly://open">Deep</a>
      <a href="https://example.com/handled" onClick={(event) => event.preventDefault()}>
        Handled
      </a>
      <div contentEditable suppressContentEditableWarning>
        <a href="https://example.com/editing">Editing</a>
      </div>
    </>
  );
}

const OPEN = "plugin:opener|open_url";

describe("links open in the default browser", () => {
  it("opens a web link outside Nookly", async () => {
    mockCommand(OPEN, null);
    render(<Probe />);
    await userEvent.setup().click(screen.getByText("Web"));
    expect(callsOf(OPEN)).toEqual([{ url: "https://example.com/page" }]);
  });

  it("opens a link that asks for a new window outside Nookly", async () => {
    mockCommand(OPEN, null);
    render(<Probe />);
    await userEvent.setup().click(screen.getByText("Blank"));
    expect(callsOf(OPEN)).toEqual([{ url: "https://example.com/blank" }]);
  });

  it("opens a mail link outside Nookly", async () => {
    mockCommand(OPEN, null);
    render(<Probe />);
    await userEvent.setup().click(screen.getByText("Mail"));
    expect(callsOf(OPEN)).toEqual([{ url: "mailto:a@example.com" }]);
  });

  it("leaves in-page and Nookly links alone", async () => {
    mockCommand(OPEN, null);
    render(<Probe />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Anchor"));
    await user.click(screen.getByText("Deep"));
    expect(callsOf(OPEN)).toEqual([]);
  });

  it("leaves a link something else already handled", async () => {
    mockCommand(OPEN, null);
    render(<Probe />);
    await userEvent.setup().click(screen.getByText("Handled"));
    expect(callsOf(OPEN)).toEqual([]);
  });

  it("leaves a link inside an editable area to the editor", async () => {
    mockCommand(OPEN, null);
    render(<Probe />);
    await userEvent.setup().click(screen.getByText("Editing"));
    expect(callsOf(OPEN)).toEqual([]);
  });
});
