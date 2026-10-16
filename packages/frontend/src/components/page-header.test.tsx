import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { IconCalendar } from "@tabler/icons-react";
import { describe, expect, it } from "vitest";
import { CalendarPageHeader, useCalendarPage } from "#/features/calendar/calendar-page.tsx";
import { ModuleViewHeader } from "#/components/module-view-header.tsx";
import { renderWithProviders } from "#/test/render.tsx";
import { PageHeader, PageHeaderActions, PageHeaderTitle } from "./page-header";

// A split view group can be a few hundred pixels wide and jsdom has no layout, so these pin the
// classes that let a header wrap onto a second line instead of squeezing its parts together.
describe("page headers in a narrow split view group", () => {
  it("lets the bar and its actions wrap, and keeps the title whole", () => {
    render(
      <PageHeader>
        <PageHeaderTitle icon={IconCalendar}>Exams</PageHeaderTitle>
        <PageHeaderActions>
          <button type="button">Action</button>
        </PageHeaderActions>
      </PageHeader>,
    );
    expect(screen.getByRole("banner").className).toMatch(/\bflex-wrap\b/);
    expect(screen.getByRole("heading", { name: "Exams" }).className).toMatch(/\bshrink-0\b/);
    const actions = screen.getByRole("button", { name: "Action" }).parentElement;
    expect(actions?.className).toMatch(/\bflex-wrap\b/);
    expect(actions?.className).toMatch(/\bbasis-/);
  });

  it("wraps the calendar header's date navigation, view switcher and create button", () => {
    const { result } = renderHook(() => useCalendarPage(undefined, "session"));
    renderWithProviders(
      <CalendarPageHeader
        page={result.current}
        icon={IconCalendar}
        title="Calendar"
        createLabel="New entry"
        createTooltip="Create an entry"
      />,
    );
    expect(screen.getByRole("banner").className).toMatch(/\bflex-wrap\b/);
    const views = screen.getByRole("navigation", { name: "Calendar views" });
    expect(views.className).toMatch(/\bflex-wrap\b/);
    expect(views.parentElement?.className).toMatch(/\bflex-wrap\b/);
    const range = screen.getByRole("button", { name: "Today" }).parentElement;
    expect(range?.className).toMatch(/\bflex-wrap\b/);
  });

  it("wraps the buttons of a list page header", () => {
    renderWithProviders(
      <ModuleViewHeader
        icon={IconCalendar}
        title="Tasks"
        view={undefined}
        presets={<button type="button">Preset</button>}
        displayMenu={<button type="button">Display</button>}
        create={{ label: "New task", tooltip: "Create a task", onClick: () => {} }}
        filterFields={[]}
        filters={[]}
        onFiltersChange={() => {}}
        dirty={false}
        save={{
          mutate: () => {},
          reset: () => {},
          isPending: false,
          isSuccess: false,
          isError: false,
        }}
        onDiscard={() => {}}
        spaceId="s1"
        module="tasks"
        display={{}}
      />,
    );
    const row = screen.getByRole("heading", { name: "Tasks" }).parentElement;
    expect(row?.className).toMatch(/\bflex-wrap\b/);
    const actions = screen.getByRole("button", { name: "Preset" }).parentElement;
    expect(actions?.className).toMatch(/\bflex-wrap\b/);
  });
});
