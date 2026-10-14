import { insetPageStyle, pageShadow } from "./inset-page.tsx";

describe("the page over the sidebar", () => {
  const colors = { background: "#000", border: "#2a2a2a" };

  it("is rounded always, which only shows once it slides aside", () => {
    expect(insetPageStyle(false, colors)).toMatchObject({ borderRadius: 38, overflow: "hidden" });
  });

  it("casts its shadow to the left, onto the sidebar, deeper in the dark theme", () => {
    expect(pageShadow(false)).toBe("-8px 0 24px -4px rgba(0, 0, 0, 0.1)");
    expect(pageShadow(true)).toContain("0.45");
  });

  it("is outlined only while aside, so no line runs around the screen", () => {
    expect(insetPageStyle(false, colors).borderWidth).toBe(0);
    expect(insetPageStyle(true, colors)).toMatchObject({ borderColor: "#2a2a2a" });
    expect(insetPageStyle(true, colors).borderWidth).toBeGreaterThan(0);
  });
});
