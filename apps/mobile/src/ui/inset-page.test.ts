import { insetPageStyle, pageShadow } from "./inset-page.tsx";

describe("the page over the sidebar", () => {
  it("is rounded always, which only shows once it slides aside", () => {
    expect(insetPageStyle("#000")).toMatchObject({
      backgroundColor: "#000",
      borderRadius: 38,
      overflow: "hidden",
    });
  });

  it("casts its shadow to the left, onto the sidebar, deeper in the dark theme", () => {
    expect(pageShadow(false)).toBe("-8px 0 24px -4px rgba(0, 0, 0, 0.1)");
    expect(pageShadow(true)).toContain("0.45");
  });
});
