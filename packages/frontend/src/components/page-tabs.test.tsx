import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  PageTabs,
  PageTabsBar,
  PageTabsContent,
  PageTabsList,
  PageTabsTrigger,
} from "@nookly/ui/components/page-tabs";
import { expectNoA11yViolations } from "#/test/axe.ts";

function Demo() {
  const [value, setValue] = useState("a");
  return (
    <PageTabs value={value} onValueChange={setValue}>
      <PageTabsBar>
        <PageTabsList aria-label="Letters">
          <PageTabsTrigger value="a">Alpha</PageTabsTrigger>
          <PageTabsTrigger value="b">Beta</PageTabsTrigger>
        </PageTabsList>
        <button type="button">+</button>
      </PageTabsBar>
      <PageTabsContent value={value}>Panel {value}</PageTabsContent>
    </PageTabs>
  );
}

describe("PageTabs", () => {
  it("switches the open tab and its panel", async () => {
    render(<Demo />);
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Beta" }));
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Panel b")).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    render(<Demo />);
    await expectNoA11yViolations();
  });

  it("is an underlined row, with no outline or track around the tabs", () => {
    render(<Demo />);
    const list = screen.getByRole("tablist");
    for (const boxed of ["border", "rounded-md", "bg-muted", "p-1", "shadow-xs"]) {
      expect(list).not.toHaveClass(boxed);
    }
    // The hairline belongs to the bar, so a button beside the tabs sits on it as well.
    const bar = list.parentElement;
    expect(bar).toHaveClass("border-b");
    const active = screen.getByRole("tab", { name: "Alpha" });
    expect(active).toHaveClass("data-[state=active]:border-primary");
    expect(active).not.toHaveClass("bg-accent");
  });

  it("leaves the open tab as plain text, not a filled button", () => {
    render(<Demo />);
    const active = screen.getByRole("tab", { name: "Alpha" });
    for (const filled of ["bg-accent", "bg-primary", "bg-raised", "border"]) {
      expect(active).not.toHaveClass(filled);
    }
  });

  it("never scrolls, in either direction: the tabs shrink instead", () => {
    render(<Demo />);
    const list = screen.getByRole("tablist");
    // An overflow rule on the list also scrolls it vertically, since the open tab's
    // underline sits a pixel below the row.
    expect(list.className).not.toMatch(/overflow/);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).not.toHaveClass("shrink-0");
      expect(tab).toHaveClass("min-w-0");
    }
  });
});
