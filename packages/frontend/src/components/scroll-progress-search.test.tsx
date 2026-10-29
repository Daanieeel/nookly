import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScrollProgressSearch,
  filterSections,
  splitMatch,
} from "@nookly/ui/components/scroll-progress-search";
import { expectNoA11yViolations } from "#/test/axe.ts";

const SECTIONS = [
  { id: "h-intro", label: "Introduction", level: 1 },
  { id: "h-bg", label: "Background", level: 2 },
  { id: "h-int", label: "Interrupts", level: 2 },
  { id: "h-methods", label: "Methods", level: 1 },
  { id: "h-int2", label: "Integration tests", level: 2 },
  { id: "h-results", label: "Results", level: 1 },
  { id: "h-disc", label: "Discussion", level: 1 },
];

let headings: HTMLElement[] = [];
beforeEach(() => {
  headings = SECTIONS.map((s) => {
    const el = document.createElement("h2");
    el.id = s.id;
    el.scrollIntoView = vi.fn();
    document.body.append(el);
    return el;
  });
});
afterEach(() => {
  for (const el of headings) el.remove();
});

const scrolledTo = () =>
  headings.filter((el) => vi.mocked(el.scrollIntoView).mock.calls.length > 0);

async function open(sections = SECTIONS) {
  const user = userEvent.setup();
  const view = render(<ScrollProgressSearch sections={sections} />);
  await user.click(await screen.findByRole("button", { name: "Show sections" }));
  return { user, view };
}

const rows = () => screen.queryAllByRole("option").map((row) => row.textContent);

describe("filterSections", () => {
  it("matches a label case insensitively and keeps the order", () => {
    expect(filterSections(SECTIONS, "INT").map((s) => s.id)).toEqual([
      "h-intro",
      "h-int",
      "h-int2",
    ]);
  });

  it("returns every section for a blank query", () => {
    expect(filterSections(SECTIONS, "  ")).toEqual(SECTIONS);
  });
});

describe("splitMatch", () => {
  it("splits a label around every match, whatever its case", () => {
    expect(splitMatch("Interrupts and interrupt", "interrupt")).toEqual([
      { text: "Interrupt", match: true },
      { text: "s and ", match: false },
      { text: "interrupt", match: true },
    ]);
  });

  it("leaves a label whole without a query or a match", () => {
    expect(splitMatch("Results", "")).toEqual([{ text: "Results", match: false }]);
    expect(splitMatch("Results", "zz")).toEqual([{ text: "Results", match: false }]);
  });
});

describe("ScrollProgressSearch", () => {
  it("opens with a labelled search field that has the focus", async () => {
    await open();
    const search = screen.getByRole("combobox", { name: "Search sections" });
    await waitFor(() => expect(search).toHaveFocus());
    expect(rows()).toHaveLength(SECTIONS.length);
  });

  it("filters the headings while typing and marks the match", async () => {
    const { user } = await open();
    await user.type(screen.getByRole("combobox"), "int");
    expect(rows()).toEqual(["Introduction", "Interrupts", "Integration tests"]);
    const marks = screen.getAllByRole("option").flatMap((o) => [...o.querySelectorAll("mark")]);
    expect(marks.map((m) => m.textContent)).toEqual(["Int", "Int", "Int"]);
  });

  it("keeps the nesting of the headings that remain", async () => {
    const { user } = await open();
    const indent = (name: string) =>
      screen.getByRole("option", { name }).closest("button")?.style.paddingLeft;
    const before = [indent("Introduction"), indent("Interrupts")];
    await user.type(screen.getByRole("combobox"), "int");
    expect([indent("Introduction"), indent("Interrupts")]).toEqual(before);
    expect(before[0]).not.toBe(before[1]);
  });

  it("says so when nothing matches", async () => {
    const { user } = await open();
    await user.type(screen.getByRole("combobox"), "zzz");
    expect(rows()).toEqual([]);
    expect(screen.getByText("No matching headings")).toBeInTheDocument();
  });

  it("jumps to the first match on Enter and closes", async () => {
    const { user } = await open();
    await user.type(screen.getByRole("combobox"), "int{Enter}");
    expect(scrolledTo()).toEqual([headings[0]]);
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  });

  it("moves through the matches with the arrow keys", async () => {
    const { user } = await open();
    await user.type(screen.getByRole("combobox"), "int{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Integration tests");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Integration tests");
    await user.keyboard("{ArrowUp}{Enter}");
    expect(scrolledTo()).toEqual([headings[2]]);
  });

  it("clears the query on the first Escape and closes on the second", async () => {
    const { user } = await open();
    await user.type(screen.getByRole("combobox"), "res");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(rows()).toHaveLength(SECTIONS.length);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  });

  it("forgets the query when the list is closed", async () => {
    const { user } = await open();
    await user.type(screen.getByRole("combobox"), "res");
    await user.keyboard("{Escape}{Escape}");
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Show sections" }));
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("jumps to a heading that is clicked", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("option", { name: "Methods" }));
    expect(scrolledTo()).toEqual([headings[3]]);
  });

  it("shows no search field on a short page", async () => {
    await open(SECTIONS.slice(0, 3));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(rows()).toHaveLength(3);
  });

  it("keeps the size of the box while a query narrows the list", async () => {
    // jsdom has no layout: the hidden copy the box sizes itself by is 240px tall.
    const height = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("w-max") ? 240 : 32;
      });
    const width = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("w-max") ? 260 : 120;
      });
    try {
      const { user, view } = await open();
      const surface = () =>
        view.container.querySelector<HTMLElement>("[data-slot=scroll-progress-surface]");
      await waitFor(() => expect(surface()?.style.height).toBe("240px"));
      const before = [surface()?.style.height, surface()?.style.width];
      await user.type(screen.getByRole("combobox"), "zzz");
      expect(rows()).toEqual([]);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect([surface()?.style.height, surface()?.style.width]).toEqual(before);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
      expect(rows()).toHaveLength(SECTIONS.length);
      expect(surface()?.style.height).toBe("240px");
    } finally {
      height.mockRestore();
      width.mockRestore();
    }
  });

  it("has no accessibility violations", async () => {
    const { user, view } = await open();
    await expectNoA11yViolations(view.container);
    await user.type(screen.getByRole("combobox"), "zzz");
    await expectNoA11yViolations(view.container);
  });
});
