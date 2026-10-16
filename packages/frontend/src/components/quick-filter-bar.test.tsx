import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconPin, IconSchool } from "@tabler/icons-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { type ActiveFilter, entityFilterOption, FilterMenu } from "./filter-menu.tsx";
import { QuickFilterBar } from "./quick-filter-bar.tsx";

const algorithms = makeEntity({ id: "c1", type: "course", title: "Algorithms", key: "CRS-3" });
const databases = makeEntity({ id: "c2", type: "course", title: "Databases", key: "CRS-7" });
const FIELDS = [
  {
    id: "course",
    label: "Course",
    icon: IconSchool,
    options: [algorithms, databases].map(entityFilterOption),
  },
  { id: "pinned", label: "Pinned", icon: IconPin, options: [{ value: "pinned", label: "Pinned" }] },
];
const course = (...values: string[]): ActiveFilter => ({
  fieldId: "course",
  operator: "is",
  values,
});

function Harness({
  favorites,
  onRemove = () => {},
  start = [],
}: {
  favorites: string[];
  onRemove?: (fieldId: string) => void;
  start?: ActiveFilter[];
}) {
  const [filters, setFilters] = useState(start);
  return (
    <TooltipProvider>
      <QuickFilterBar
        fields={FIELDS}
        filters={filters}
        onFiltersChange={setFilters}
        favorites={favorites}
        onRemove={onRemove}
      />
      <button type="button" onClick={() => setFilters([])}>
        Clear filters
      </button>
      <output aria-label="Active">{JSON.stringify(filters)}</output>
    </TooltipProvider>
  );
}

const active = () => JSON.parse(screen.getByLabelText("Active").textContent ?? "[]");

describe("QuickFilterBar", () => {
  it("shows nothing without favourites", () => {
    render(<Harness favorites={[]} />);
    expect(screen.queryByRole("group", { name: "Quick filters" })).toBeNull();
  });

  it("leaves out a favourite whose field the page does not offer", () => {
    render(<Harness favorites={["gone"]} />);
    expect(screen.queryByRole("group", { name: "Quick filters" })).toBeNull();
  });

  it("names each favourite by its field and opens that field's options", async () => {
    const user = userEvent.setup();
    render(<Harness favorites={["course"]} />);
    await user.click(screen.getByRole("button", { name: "Course" }));
    await user.click(await screen.findByRole("option", { name: /Algorithms/ }));
    expect(active()).toEqual([course("c1")]);
  });

  it("goes away once its field is filtered, and comes back when the filter is gone", async () => {
    const user = userEvent.setup();
    render(<Harness favorites={["course", "pinned"]} start={[course("c1")]} />);
    expect(screen.queryByRole("button", { name: /^Course/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Pinned" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("button", { name: "Course" })).toBeInTheDocument();
  });

  it("leaves the bar empty while every favourite is filtered", () => {
    render(<Harness favorites={["course"]} start={[course("c1")]} />);
    expect(screen.queryByRole("group", { name: "Quick filters" })).toBeNull();
  });

  it("keeps the checkboxes of the options from shrinking", async () => {
    const user = userEvent.setup();
    render(<Harness favorites={["course"]} />);
    await user.click(screen.getByRole("button", { name: "Course" }));
    const option = await screen.findByRole("option", { name: /Algorithms/ });
    expect(option.firstElementChild?.className).toContain("shrink-0");
  });

  it("draws a dashed outline with no fill while the field is not used", () => {
    render(<Harness favorites={["course"]} />);
    const chip = screen.getByRole("button", { name: "Course" }).parentElement;
    expect(chip?.className).toContain("border-dashed");
    expect(chip?.className).not.toMatch(/(^|\s)bg-/);
  });

  it("removes a favourite from its own button", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Harness favorites={["course"]} onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Remove Course from Quick Filters" }));
    expect(onRemove).toHaveBeenCalledWith("course");
  });

  it("has no axe violations", async () => {
    render(<Harness favorites={["course"]} />);
    await expectNoA11yViolations();
  });
});

function Menu({
  favorites = [],
  onToggle = () => {},
  start = [],
}: {
  favorites?: string[];
  onToggle?: (fieldId: string) => void;
  start?: ActiveFilter[];
}) {
  return (
    <TooltipProvider>
      <FilterMenu
        fields={FIELDS}
        filters={start}
        onFiltersChange={() => {}}
        quickFilters={{ favorites, onToggle }}
      />
    </TooltipProvider>
  );
}

describe("the star on a field in the Filter popover", () => {
  it("adds the field to the quick filters, without picking it", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Menu onToggle={onToggle} />);
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(await screen.findByLabelText("Add Course to Quick Filters"));
    expect(onToggle).toHaveBeenCalledWith("course");
    // The field list stays up instead of moving on to the options.
    expect(screen.queryByRole("option", { name: /Algorithms/ })).toBeNull();
  });

  it("is filled for a field that is a quick filter, and takes it out again", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Menu favorites={["course"]} onToggle={onToggle} />);
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(await screen.findByLabelText("Remove Course from Quick Filters"));
    expect(onToggle).toHaveBeenCalledWith("course");
  });

  it("can be pressed with the keyboard on the field that is highlighted", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Menu onToggle={onToggle} />);
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await screen.findByRole("option", { name: /Course/ });
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onToggle).toHaveBeenCalledWith("course");
  });

  it("is not there when the page has no quick filters", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <FilterMenu fields={FIELDS} filters={[]} onFiltersChange={() => {}} />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await screen.findByRole("option", { name: /Course/ });
    expect(screen.queryByRole("button", { name: /Quick Filters/ })).toBeNull();
    expect(screen.queryByLabelText(/Quick Filters/)).toBeNull();
  });

  it("has no axe violations", async () => {
    const user = userEvent.setup();
    render(<Menu favorites={["course"]} />);
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await screen.findByRole("option", { name: /Course/ });
    await expectNoA11yViolations();
  });
});

describe("the star on a filter chip", () => {
  it("names the field in code style in its tooltip", async () => {
    const user = userEvent.setup();
    render(<Menu start={[course("c1")]} />);
    await user.hover(screen.getByRole("button", { name: "Add Course to Quick Filters" }));
    const code = (await screen.findAllByText("Course", { selector: "code" }))[0];
    expect(code.parentElement).toHaveTextContent("Add Course to Quick Filters");
  });

  it("is a crossed out star while the field is a quick filter, as pressing it removes it", () => {
    const { rerender } = render(<Menu start={[course("c1")]} />);
    const star = () =>
      screen.getByRole("button", { name: /Quick Filters/ }).querySelector("svg")?.classList;
    expect(star()).toContain("tabler-icon-star");
    rerender(<Menu start={[course("c1")]} favorites={["course"]} />);
    expect(star()).toContain("tabler-icon-star-off");
  });

  it("stars the chip's field", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Menu start={[course("c1")]} onToggle={onToggle} />);
    await user.click(screen.getByRole("button", { name: "Add Course to Quick Filters" }));
    expect(onToggle).toHaveBeenCalledWith("course");
  });
});
