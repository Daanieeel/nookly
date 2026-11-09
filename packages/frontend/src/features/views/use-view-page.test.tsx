import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { InvokeArgs } from "@tauri-apps/api/core";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normalizeDisplay, readDisplay } from "#/features/tasks/task-model.ts";
import { preferences } from "#/lib/preferences.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { useViewPage } from "./use-view-page.ts";

const configOf = (args: InvokeArgs | undefined) =>
  z.object({ config: z.string() }).parse(args).config;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const options = (viewId: string | undefined) => ({
  spaceId: "s1",
  module: "tasks" as const,
  viewId,
  readDisplay,
  normalizeDisplay,
  remember: () => {},
  filtersKey: "test:filters",
  defaultFilters: [],
});

describe("saving a page on the view engine", () => {
  it("keeps what the page can not read when it saves over a View", async () => {
    const stored = {
      version: 2,
      source: "task",
      scope: { relationship: "relates-to", direction: "both" },
      future: { kept: true },
      filters: [
        { fieldId: "due", operator: "before", values: ["2026-12-01"] },
        { fieldId: "due", operator: "withinNext", values: ["3"] },
      ],
      display: { layout: "table", someday: 1 },
    };
    const view = {
      entity: makeEntity({ id: "v1", type: "view" }),
      module: "tasks",
      config: JSON.stringify(stored),
      position: 0,
    };
    mockCommand("get_view", view);
    mockCommandWith("update_view_config", (args) => ({ ...view, config: configOf(args) }));

    const { result } = renderHook(() => useViewPage(options("v1")), { wrapper });
    await waitFor(() => expect(result.current.view).toBeDefined());
    expect(result.current.conditions).toEqual([
      { fieldId: "due", operator: "before", values: ["2026-12-01"] },
    ]);

    act(() => result.current.setFilters([{ fieldId: "status", operator: "is", values: ["todo"] }]));
    expect(result.current.dirty).toBe(true);
    await act(() => result.current.save.mutateAsync());

    const saved = JSON.parse(configOf(callsOf("update_view_config")[0]));
    expect(saved.scope).toEqual(stored.scope);
    expect(saved.future).toEqual(stored.future);
    expect(saved.display.someday).toBe(1);
    expect(saved.filters).toEqual([
      { fieldId: "status", operator: "is", values: ["todo"] },
      { fieldId: "due", operator: "before", values: ["2026-12-01"] },
      { fieldId: "due", operator: "withinNext", values: ["3"] },
    ]);
  });

  it("remembers the conditions of the plain page with its filters", async () => {
    const { result } = renderHook(() => useViewPage(options(undefined)), { wrapper });
    act(() =>
      result.current.setConditions([{ fieldId: "effort", operator: "gte", values: ["3"] }]),
    );
    await act(() => result.current.save.mutateAsync());
    expect(JSON.parse(preferences.get("test:filters:s1") ?? "[]")).toEqual([
      { fieldId: "effort", operator: "gte", values: ["3"] },
    ]);

    const reopened = renderHook(() => useViewPage(options(undefined)), { wrapper });
    expect(reopened.result.current.conditions).toEqual([
      { fieldId: "effort", operator: "gte", values: ["3"] },
    ]);
  });
});
