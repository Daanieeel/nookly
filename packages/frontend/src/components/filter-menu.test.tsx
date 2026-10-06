import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconSchool } from "@tabler/icons-react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { type ActiveFilter, entityFilterOption, FilterMenu } from "./filter-menu.tsx";

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

function renderMenu(filters: ActiveFilter[] = []) {
  const onFiltersChange = vi.fn<(filters: ActiveFilter[]) => void>();
  render(
    <TooltipProvider>
      <FilterMenu fields={FIELDS} filters={filters} onFiltersChange={onFiltersChange} />
    </TooltipProvider>,
  );
  return { onFiltersChange, user: userEvent.setup() };
}

describe("FilterMenu", () => {
  it("lists an entity option with its icon and key, and finds it by key", async () => {
    const { onFiltersChange, user } = renderMenu();
    await user.click(screen.getByRole("button", { name: /Filter/ }));
    await user.click(screen.getByRole("option", { name: "Course" }));

    const option = screen.getByRole("option", { name: /Algorithms/ });
    expect(within(option).getByText("CRS-3")).toBeInTheDocument();
    expect(option.querySelector("svg")).not.toBeNull();
    await expectNoA11yViolations();

    await user.type(screen.getByRole("combobox"), "crs7");
    expect(screen.queryByRole("option", { name: /Algorithms/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Databases/ }));
    expect(onFiltersChange).toHaveBeenCalledWith([
      { fieldId: "course", operator: "is", values: ["c2"] },
    ]);
  });

  it("shows the key in an applied filter's option list too", async () => {
    const { user } = renderMenu([{ fieldId: "course", operator: "is", values: ["c1"] }]);
    await user.click(screen.getByRole("button", { name: "Course: Algorithms" }));
    const option = screen.getByRole("option", { name: /Databases/ });
    expect(within(option).getByText("CRS-7")).toBeInTheDocument();
    await expectNoA11yViolations();
  });
});
