import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { DashboardBriefing } from "./DashboardBriefing";
import type { DashboardData } from "./dashboard-data";

const data: DashboardData = {
  name: "Ada",
  now: new Date(2026, 9, 12, 10),
  today: "2026-10-12",
  tasks: [],
  todaySessions: [],
  deadlines: [],
  jots: [],
  jotCount: 0,
  studyDecks: [],
};

/// jsdom has no layout; a sentence that overflows its box has more height than the box.
function overflow(scrollHeight: number, clientHeight: number) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(clientHeight);
}

beforeEach(() => {
  mockCommand("list_spaces", []);
  mockCommand("list_task_statuses", []);
});
afterEach(() => vi.restoreAllMocks());

describe("the briefing sentence", () => {
  it("stops at a few lines", () => {
    renderWithProviders(<DashboardBriefing data={data} />);
    expect(document.getElementById("dashboard-briefing")?.className).toContain("line-clamp-");
  });

  it("offers no expand button while the sentence fits", () => {
    overflow(100, 100);
    renderWithProviders(<DashboardBriefing data={data} />);
    expect(screen.queryByRole("button", { name: /show (all|less)/i })).toBeNull();
  });

  // Reported (#127): the sentence is the one part with no upper bound, so it is capped and
  // the whole of it stays one click away.
  it("folds a long sentence and lets the whole of it be read", async () => {
    overflow(300, 112);
    const { user } = renderWithProviders(<DashboardBriefing data={data} />);
    const show = await screen.findByRole("button", { name: "Show all" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    await user.click(show);
    const less = await screen.findByRole("button", { name: "Show less" });
    expect(less).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("dashboard-briefing")?.className).not.toContain("line-clamp-");
    await user.click(less);
    expect(await screen.findByRole("button", { name: "Show all" })).toBeInTheDocument();
    expect(document.getElementById("dashboard-briefing")?.className).toContain("line-clamp-");
  });
});
