import { insetPageStyle } from "./inset-page.ts";

describe("the page over the sidebar", () => {
  const colors = { background: "#000", border: "#2a2a2a" };

  it("is rounded always, which only shows once it slides aside", () => {
    expect(insetPageStyle(false, colors)).toMatchObject({ borderRadius: 38, overflow: "hidden" });
  });

  it("casts a shadow onto the sidebar while aside, deeper in the dark theme", () => {
    expect(insetPageStyle(false, colors).boxShadow).toBe("none");
    expect(insetPageStyle(true, colors).boxShadow).toBe("-12px 0 32px -4px rgba(0, 0, 0, 0.18)");
    expect(insetPageStyle(true, colors, true).boxShadow).toContain("0.7");
  });

  it("is outlined only while aside, so no line runs around the screen", () => {
    expect(insetPageStyle(false, colors).borderWidth).toBe(0);
    expect(insetPageStyle(true, colors)).toMatchObject({ borderColor: "#2a2a2a" });
    expect(insetPageStyle(true, colors).borderWidth).toBeGreaterThan(0);
  });
});
