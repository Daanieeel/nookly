import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimeInput } from "./time-input.tsx";

function setup() {
  render(<TimeInput value="09:30" onChange={() => {}} aria-label="Starts" />);
  const group = screen.getByRole("group", { name: "Starts" });
  const hour = screen.getByRole("spinbutton", { name: "Starts Hour" });
  const minute = screen.getByRole("spinbutton", { name: "Starts Minute" });
  // jsdom has no layout: the minute segment starts 100px in.
  minute.getBoundingClientRect = () => new DOMRect(100, 0, 20, 20);
  return { group, hour, minute };
}

describe("TimeInput click targets", () => {
  it("focuses the hour when the empty space left of the minutes is clicked", () => {
    const { group, hour } = setup();
    fireEvent.mouseDown(group, { clientX: 10 });
    expect(hour).toHaveFocus();
  });

  it("focuses the hour when the space right of the minutes is clicked", () => {
    const { group, hour } = setup();
    fireEvent.mouseDown(group, { clientX: 150 });
    expect(hour).toHaveFocus();
  });

  it("focuses the hour when the colon between the segments is clicked", () => {
    const { hour } = setup();
    fireEvent.mouseDown(screen.getByText(":"));
    expect(hour).toHaveFocus();
  });

  it("focuses the hour from anywhere in the field, wherever the minutes sit", () => {
    const { group, hour } = setup();
    for (const clientX of [0, 10, 99, 101, 130, 400]) {
      fireEvent.mouseDown(group, { clientX });
      expect(hour).toHaveFocus();
      hour.blur();
    }
  });

  it("focuses the minutes when their digits are clicked", () => {
    const { minute } = setup();
    fireEvent.mouseDown(minute);
    expect(minute).toHaveFocus();
  });

  it("focuses the period when AM or PM is clicked", () => {
    render(<TimeInput value="09:30" onChange={() => {}} aria-label="Ends" />);
    const periods = screen.queryAllByRole("spinbutton", { name: "Ends AM or PM" });
    // A 24 hour clock has none; on a 12 hour clock a click on it stays on it.
    for (const period of periods) {
      fireEvent.mouseDown(period);
      expect(period).toHaveFocus();
    }
  });

  it("focuses the hour when its digits are clicked", () => {
    const { hour } = setup();
    fireEvent.mouseDown(hour);
    expect(hour).toHaveFocus();
  });
});
