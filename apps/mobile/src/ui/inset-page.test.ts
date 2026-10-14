import { PAGE_BACKGROUND } from "./classes.ts";
import { PAGE_OUTLINE, insetPageStyle, pageShadow } from "./inset-page.tsx";

describe("the page over the sidebar", () => {
  it("is the desktop page pane's card, not the window's background", () => {
    expect(PAGE_BACKGROUND).toBe("bg-card");
  });

  it("is rounded always, which only shows once it slides aside", () => {
    expect(insetPageStyle("#000")).toMatchObject({
      backgroundColor: "#000",
      borderRadius: 38,
      overflow: "hidden",
    });
  });

  it("is outlined like the desktop's page pane", () => {
    expect(PAGE_OUTLINE).toBe("border border-sidebar-border");
  });

  it("casts its shadow to the left, onto the sidebar, deeper in the dark theme", () => {
    expect(pageShadow(false)).toBe("-8px 0 24px -4px rgba(0, 0, 0, 0.1)");
    expect(pageShadow(true)).toContain("0.45");
  });
});
