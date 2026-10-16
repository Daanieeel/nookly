import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconSchool } from "@tabler/icons-react";
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
  favorites: ActiveFilter[];
  onRemove?: (favorite: ActiveFilter) => void;
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

  it("names each favourite by its option, and turns it on and off with a click", async () => {
    const user = userEvent.setup();
    render(<Harness favorites={[course("c1"), course("c2")]} />);
    const algorithmsChip = screen.getByRole("button", { name: "Algorithms" });
    expect(algorithmsChip).toHaveAttribute("aria-pressed", "false");
    await user.click(algorithmsChip);
    expect(active()).toEqual([course("c1")]);
    expect(algorithmsChip).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Databases" }));
    expect(active()).toEqual([course("c2")]);
    expect(algorithmsChip).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Databases" }));
    expect(active()).toEqual([]);
  });

  it("draws a dotted outline with no fill, solid once on", async () => {
    const user = userEvent.setup();
    render(<Harness favorites={[course("c1")]} />);
    const chip = screen.getByRole("button", { name: "Algorithms" }).parentElement;
    expect(chip?.className).toContain("border-dotted");
    expect(chip?.className).not.toMatch(/(^|\s)bg-/);
    await user.click(screen.getByRole("button", { name: "Algorithms" }));
    expect(chip?.className).toContain("border-solid");
  });

  it("reads several values as a count, and an isNot filter with Not", () => {
    render(
      <Harness
        favorites={[course("c1", "c2"), { fieldId: "course", operator: "isNot", values: ["c1"] }]}
      />,
    );
    expect(screen.getByRole("button", { name: "2 course" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not Algorithms" })).toBeInTheDocument();
  });

  it("leaves out a favourite whose option is gone, and keeps the others", () => {
    render(<Harness favorites={[course("gone"), course("c1")]} />);
    expect(screen.queryByRole("button", { name: /gone/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Algorithms" })).toBeInTheDocument();
  });

  it("removes a favourite from its own button", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Harness favorites={[course("c1")]} onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Remove Quick Filter Algorithms" }));
    expect(onRemove).toHaveBeenCalledWith(course("c1"));
  });

  it("has no axe violations", async () => {
    render(<Harness favorites={[course("c1")]} start={[course("c1")]} />);
    await expectNoA11yViolations();
  });
});

describe("the star on a filter chip", () => {
  it("adds the chip's filter to the quick filters, and takes it out again", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(
      <TooltipProvider>
        <FilterMenu
          fields={FIELDS}
          filters={[course("c1")]}
          onFiltersChange={() => {}}
          quickFilters={{ favorites: [], onToggle }}
        />
      </TooltipProvider>,
    );
    const star = screen.getByRole("button", { name: "Quick Filter" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    await user.click(star);
    expect(onToggle).toHaveBeenCalledWith(course("c1"));
    rerender(
      <TooltipProvider>
        <FilterMenu
          fields={FIELDS}
          filters={[course("c1")]}
          onFiltersChange={() => {}}
          quickFilters={{ favorites: [course("c1")], onToggle }}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Quick Filter" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("is not there when the page has no quick filters", () => {
    render(
      <TooltipProvider>
        <FilterMenu fields={FIELDS} filters={[course("c1")]} onFiltersChange={() => {}} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("button", { name: "Quick Filter" })).toBeNull();
  });
});
