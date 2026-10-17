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

function renderMenu(filters: ActiveFilter[] = [], fields = FIELDS) {
  const onFiltersChange = vi.fn<(filters: ActiveFilter[]) => void>();
  render(
    <TooltipProvider>
      <FilterMenu fields={fields} filters={filters} onFiltersChange={onFiltersChange} />
    </TooltipProvider>,
  );
  return { onFiltersChange, user: userEvent.setup() };
}

describe("FilterMenu", () => {
  it("cuts the option a chip shows at 15 characters, whatever the filter", () => {
    renderMenu([{ fieldId: "course", operator: "is", values: ["c1"] }]);
    const label = screen.getByRole("button", { name: "Course: Algorithms" }).querySelector("span");
    expect(label?.className).toContain("max-w-[15ch]");
    expect(label?.className).toContain("truncate");
  });

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

  it("lists the fields alphabetically, whatever order the page gives them", async () => {
    const field = (id: string, label: string) => ({ id, label, icon: IconSchool, options: [] });
    const { user } = renderMenu(
      [],
      [field("u", "Updated"), field("c", "Course"), field("s", "Status"), field("d", "due date")],
    );
    await user.click(screen.getByRole("button", { name: /Filter/ }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Course",
      "due date",
      "Status",
      "Updated",
    ]);
  });

  describe("joining chips with or", () => {
    const TWO: ActiveFilter[] = [
      { fieldId: "course", operator: "is", values: ["c1"] },
      { fieldId: "status", operator: "is", values: ["todo"] },
    ];
    const FIELDS_TWO = [
      ...FIELDS,
      {
        id: "status",
        label: "Status",
        icon: IconSchool,
        options: [{ value: "todo", label: "To do" }],
      },
    ];

    it("shows no connector between chips for a single chip", () => {
      renderMenu([TWO[0]!], FIELDS_TWO);
      expect(screen.queryByRole("button", { name: /^Match/ })).not.toBeInTheDocument();
    });

    it("shows no placeholder while nothing is filtered", () => {
      renderMenu([], FIELDS_TWO);
      expect(screen.queryByRole("button", { name: "Add filter" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Next filter/ })).not.toBeInTheDocument();
    });

    it("always ends the chips with an and and a dotted placeholder that adds a filter", async () => {
      const { onFiltersChange, user } = renderMenu([TWO[0]!], FIELDS_TWO);
      expect(
        screen.getByRole("button", { name: "Next filter: match both. Switch to match either" }),
      ).toHaveTextContent("and");
      const placeholder = screen.getByRole("button", { name: "Add filter" });
      expect(placeholder.className).toContain("border-dotted");
      await user.click(placeholder);
      await user.click(screen.getByRole("option", { name: "Status" }));
      await user.click(screen.getByRole("option", { name: "To do" }));
      expect(onFiltersChange).toHaveBeenCalledWith(TWO);
    });

    it("adds the next filter joined with or once the trailing and is switched", async () => {
      const { onFiltersChange, user } = renderMenu([TWO[0]!], FIELDS_TWO);
      await user.click(
        screen.getByRole("button", { name: "Next filter: match both. Switch to match either" }),
      );
      expect(
        screen.getByRole("button", { name: "Next filter: match either. Switch to match both" }),
      ).toHaveTextContent("or");
      await user.click(screen.getByRole("button", { name: "Add filter" }));
      await user.click(screen.getByRole("option", { name: "Status" }));
      await user.click(screen.getByRole("option", { name: "To do" }));
      expect(onFiltersChange).toHaveBeenCalledWith([TWO[0], { ...TWO[1], join: "or" }]);
    });

    it("hides the placeholder once every field is filtered", () => {
      renderMenu(TWO, FIELDS_TWO);
      expect(screen.queryByRole("button", { name: "Add filter" })).not.toBeInTheDocument();
    });

    it("offers an and connector between two chips, which switches the second to or", async () => {
      const { onFiltersChange, user } = renderMenu(TWO, FIELDS_TWO);
      const connector = screen.getByRole("button", { name: "Match both. Switch to match either" });
      expect(connector).toHaveTextContent("and");
      await user.click(connector);
      expect(onFiltersChange).toHaveBeenCalledWith([TWO[0], { ...TWO[1], join: "or" }]);
    });

    it("shows an or connector that switches back to and", async () => {
      const joined: ActiveFilter[] = [TWO[0]!, { ...TWO[1]!, join: "or" }];
      const { onFiltersChange, user } = renderMenu(joined, FIELDS_TWO);
      const connector = screen.getByRole("button", { name: "Match either. Switch to match both" });
      expect(connector).toHaveTextContent("or");
      expect(screen.getByRole("group", { name: "Match any of these filters" })).toBeInTheDocument();
      await user.click(connector);
      expect(onFiltersChange).toHaveBeenCalledWith([TWO[0], { ...TWO[1], join: "and" }]);
    });

    it("keeps unjoined chips outside a group", () => {
      renderMenu(TWO, FIELDS_TWO);
      expect(screen.queryByRole("group", { name: /Match any/ })).not.toBeInTheDocument();
    });

    it("has no a11y violations", async () => {
      renderMenu([TWO[0]!, { ...TWO[1]!, join: "or" }], FIELDS_TWO);
      await expectNoA11yViolations();
    });
  });

  describe("Clear filters", () => {
    const ONE: ActiveFilter[] = [{ fieldId: "course", operator: "is", values: ["c1"] }];

    it("is not offered without filters", () => {
      renderMenu();
      expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    });

    it("clears every filter", async () => {
      const { onFiltersChange, user } = renderMenu(ONE);
      expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(onFiltersChange).toHaveBeenCalledWith([]);
    });

    it("sits with the Filter button, in a row above the chips", () => {
      const status = { id: "status", label: "Status", icon: IconSchool, options: [] };
      renderMenu(ONE, [...FIELDS, status]);
      const clear = screen.getByRole("button", { name: "Clear filters" });
      const filter = screen.getByRole("button", { name: "Filter" });
      const chip = screen.getByRole("button", { name: "Course: Algorithms" });
      expect(filter.parentElement).toContainElement(clear);
      expect(clear.parentElement).not.toContainElement(chip);
      expect(clear.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("goes with the Filter button when the page places the chips apart", () => {
      const props = { fields: FIELDS, filters: ONE, onFiltersChange: vi.fn() };
      const { container } = render(
        <TooltipProvider>
          <FilterMenu {...props} part="button" />
          <p>between</p>
          <FilterMenu {...props} part="chips" />
        </TooltipProvider>,
      );
      const clear = screen.getByRole("button", { name: "Clear filters" });
      expect(container.firstElementChild).toContainElement(clear);
      expect(screen.getByText("between").nextElementSibling).not.toContainElement(clear);
    });
  });
});
