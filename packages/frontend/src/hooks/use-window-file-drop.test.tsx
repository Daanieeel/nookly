import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWindowFileDrop } from "./use-window-file-drop.ts";

function Probe({ onFiles }: { onFiles: (files: File[], zone: Element | null) => void }) {
  useWindowFileDrop(onFiles);
  return (
    <div data-file-drop="zone">
      <button type="button">Inside</button>
    </div>
  );
}

/// jsdom has no DragEvent or DataTransfer, so the event is built by hand.
function dragEvent(type: string, types: string[], files: File[] = []) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const dataTransfer = { types, files, dropEffect: "none" };
  return Object.assign(event, { dataTransfer });
}

const pdf = () => new File(["hi"], "notes.pdf", { type: "application/pdf" });

describe("dropping files on the window", () => {
  it("cancels the drop so the webview never opens the file (the full screen bug)", () => {
    render(<Probe onFiles={() => {}} />);
    const event = dragEvent("drop", ["Files"], [pdf()]);
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("accepts a file dragged over anywhere, as a copy", () => {
    render(<Probe onFiles={() => {}} />);
    const event = dragEvent("dragover", ["Files"]);
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(event.dataTransfer.dropEffect).toBe("copy");
  });

  it("leaves drags that carry no files to the app's own drag and drop", () => {
    render(<Probe onFiles={() => {}} />);
    const over = dragEvent("dragover", ["text/plain"]);
    const drop = dragEvent("drop", ["text/plain"]);
    document.body.dispatchEvent(over);
    document.body.dispatchEvent(drop);
    expect(over.defaultPrevented).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
  });

  it("hands the files and the zone they landed on to the handler", () => {
    const onFiles = vi.fn();
    const { getByRole } = render(<Probe onFiles={onFiles} />);
    const file = pdf();
    getByRole("button", { name: "Inside" }).dispatchEvent(dragEvent("drop", ["Files"], [file]));
    expect(onFiles).toHaveBeenCalledOnce();
    expect(onFiles.mock.calls[0]?.[0]).toEqual([file]);
    expect(onFiles.mock.calls[0]?.[1]).toHaveAttribute("data-file-drop", "zone");
  });

  it("does nothing more when something already took the drop", () => {
    const onFiles = vi.fn();
    const { getByRole } = render(
      <div onDrop={(event) => event.preventDefault()}>
        <Probe onFiles={onFiles} />
      </div>,
    );
    getByRole("button", { name: "Inside" }).dispatchEvent(dragEvent("drop", ["Files"], [pdf()]));
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("passes no zone for a drop outside every zone", () => {
    const onFiles = vi.fn();
    render(<Probe onFiles={onFiles} />);
    document.body.dispatchEvent(dragEvent("drop", ["Files"], [pdf()]));
    expect(onFiles.mock.calls[0]?.[1]).toBeNull();
  });
});
