import { fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import { phoneSettings } from "../data/settings.ts";
import { TimeInput, typeSegment } from "./TimeInput.tsx";

const HOUR = { min: 0, max: 23 };
const MINUTE = { min: 0, max: 59 };

// The hour opened as "09" with the caret at its end, so its two digit limit swallowed every
// key; the minute took any number, 75 too. A segment types as the desktop's does: a key on a
// full segment starts it over, a digit no second one can follow finishes it, and nothing out
// of range stays.
describe("typing a time segment", () => {
  it("starts a full segment over with the key typed", () => {
    expect(typeSegment("09", "091", HOUR)).toEqual({ text: "1", value: 1, done: false });
  });

  it("finishes a segment on a digit no second one can follow", () => {
    expect(typeSegment("", "7", MINUTE)).toEqual({ text: "07", value: 7, done: true });
    expect(typeSegment("", "3", HOUR)).toEqual({ text: "03", value: 3, done: true });
    expect(typeSegment("", "2", HOUR)).toEqual({ text: "2", value: 2, done: false });
  });

  it("takes two digits in range, and starts over on two out of it", () => {
    expect(typeSegment("1", "14", HOUR)).toEqual({ text: "14", value: 14, done: true });
    expect(typeSegment("2", "25", HOUR)).toEqual({ text: "05", value: 5, done: true });
    expect(typeSegment("5", "59", MINUTE)).toEqual({ text: "59", value: 59, done: true });
  });

  it("on a 12 hour clock never takes 0 or past 12", () => {
    const twelve = { min: 1, max: 12 };
    expect(typeSegment("", "1", twelve)).toEqual({ text: "1", value: 1, done: false });
    expect(typeSegment("1", "13", twelve)).toEqual({ text: "03", value: 3, done: true });
    expect(typeSegment("0", "00", twelve)).toEqual({ text: "0", value: null, done: false });
  });
});

describe("the time input", () => {
  beforeEach(() => phoneSettings.setJson("general.timeFormat", "european"));
  afterEach(() => phoneSettings.reset("general.timeFormat"));

  function Clock() {
    const [time, setTime] = useState<string | null>("09:00");
    return <TimeInput label="Starts" value={time} onChange={setTime} large />;
  }

  it("types an hour over the one it opened with, and never a minute past 59", () => {
    const screen = render(<Clock />);
    const hour = screen.getByLabelText("Starts, hour");
    fireEvent.changeText(hour, "091");
    fireEvent.changeText(hour, "14");
    expect(screen.getByLabelText("Starts, hour").props.value).toBe("14");
    const minute = screen.getByLabelText("Starts, minute");
    fireEvent.changeText(minute, "007");
    expect(screen.getByLabelText("Starts, minute").props.value).toBe("07");
    // A key on the full minute starts it over: 5 waits for its second digit, 75 never shows.
    fireEvent.changeText(minute, "075");
    expect(screen.getByLabelText("Starts, minute").props.value).toBe("5");
  });
});
