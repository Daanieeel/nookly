import { kindColor } from "./file-kinds.ts";

const colors = {
  positive: "green",
  destructive: "red",
  primary: "blue",
  caution: "yellow",
  mutedForeground: "gray",
};

// The icons of every kind were drawn gray; the desktop tints them by type.
describe("file kind colours", () => {
  it("tint the icons as the desktop does", () => {
    expect(kindColor("pdf", colors)).toBe("red");
    expect(kindColor("image", colors)).toBe("green");
    expect(kindColor("sheet", colors)).toBe("green");
    expect(kindColor("slides", colors)).toBe("yellow");
    expect(kindColor("document", colors)).toBe("blue");
    expect(kindColor("audio", colors)).toBe("blue");
    expect(kindColor("video", colors)).toBe("blue");
    expect(kindColor("archive", colors)).toBe("gray");
    expect(kindColor("code", colors)).toBe("gray");
    expect(kindColor("other", colors)).toBe("gray");
  });
});
