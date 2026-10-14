import { LIST_ROW_CLASSES } from "@nookly/frontend/classes";
import { buttonVariants, sidebarMenuButtonVariants } from "@nookly/ui/classes";
import { row, splitText, withState } from "./classes.ts";
import { ROW_DIVIDER } from "./Row.tsx";

describe("the desktop's classes on the phone", () => {
  it("put text classes on the text inside a box", () => {
    const { box, text } = splitText(buttonVariants({ variant: "default", size: "sm" }));
    expect(text.split(" ")).toEqual(
      expect.arrayContaining(["text-xs", "font-medium", "text-primary-foreground"]),
    );
    expect(box.split(" ")).toEqual(expect.arrayContaining(["h-8", "px-3", "bg-primary"]));
    expect(box).not.toMatch(/\btext-/);
  });

  it("keep the classes of a state that holds and drop the others", () => {
    const active = withState(sidebarMenuButtonVariants(), { active: true });
    expect(active).toContain(" bg-sidebar-accent ");
    expect(active).not.toMatch(/(^| )data-\[/);
    const idle = withState(sidebarMenuButtonVariants(), { active: false });
    expect(idle).not.toContain(" bg-sidebar-accent ");
  });

  it("lay out a desktop row in a row", () => {
    expect(row("flex items-center")).toBe("flex items-center flex-row");
  });

  it("take the line under a row from the desktop's list rows", () => {
    expect(ROW_DIVIDER).toBe("border-b border-border/60");
    expect(LIST_ROW_CLASSES).toContain(ROW_DIVIDER);
  });
});
