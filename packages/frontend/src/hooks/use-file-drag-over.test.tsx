import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFileDragOver } from "./use-file-drag-over.ts";

function Probe() {
  const { over, dragProps } = useFileDragOver();
  return (
    <div data-testid="zone" {...dragProps}>
      <button type="button">Child</button>
      {over && <p>Drop here</p>}
    </div>
  );
}

const files = { dataTransfer: { types: ["Files"] } };
const text = { dataTransfer: { types: ["text/plain"] } };

describe("useFileDragOver", () => {
  it("shows while a file is dragged over and hides when it leaves", () => {
    render(<Probe />);
    fireEvent.dragEnter(screen.getByTestId("zone"), files);
    expect(screen.getByText("Drop here")).toBeInTheDocument();
    fireEvent.dragLeave(screen.getByTestId("zone"), files);
    expect(screen.queryByText("Drop here")).not.toBeInTheDocument();
  });

  it("stays while the drag moves between children of the zone", () => {
    render(<Probe />);
    const zone = screen.getByTestId("zone");
    const child = screen.getByRole("button", { name: "Child" });
    fireEvent.dragEnter(zone, files);
    fireEvent.dragEnter(child, files);
    fireEvent.dragLeave(zone, files);
    expect(screen.getByText("Drop here")).toBeInTheDocument();
    fireEvent.dragLeave(child, files);
    expect(screen.queryByText("Drop here")).not.toBeInTheDocument();
  });

  it("hides after the drop", () => {
    render(<Probe />);
    const zone = screen.getByTestId("zone");
    fireEvent.dragEnter(zone, files);
    fireEvent.drop(zone, files);
    expect(screen.queryByText("Drop here")).not.toBeInTheDocument();
  });

  it("ignores drags that carry no files", () => {
    render(<Probe />);
    fireEvent.dragEnter(screen.getByTestId("zone"), text);
    expect(screen.queryByText("Drop here")).not.toBeInTheDocument();
  });
});
