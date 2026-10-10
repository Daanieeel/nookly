import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeEntity, makeSession } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { EntityPickerList } from "./entity-picker.tsx";

function setup() {
  mockCommand("list_entities", [
    makeEntity({ id: "n1", type: "note", title: "Wave notes", key: "NTE-1" }),
    makeEntity({ id: "se1", type: "session", title: "Physics", key: "SES-1" }),
  ]);
  mockCommand("list_sessions", [
    makeSession(
      { courseTitle: "Physics", date: "2026-03-10", startTime: "09:00", endTime: "10:30" },
      { id: "se1", title: "Physics", key: "SES-1" },
    ),
  ]);
  return renderWithProviders(<EntityPickerList spaceId="space-1" onSelect={() => {}} />);
}

const SEARCH = "Search this Space…";

describe("EntityPickerList", () => {
  it("shows a session with its day and time", async () => {
    setup();
    expect(await screen.findByText(/Mar 10/)).toBeTruthy();
  });

  it.each(["physics", "tue", "mar 10", "9am", "2026-03-10", "ses-1"])(
    "finds the session by %s",
    async (query) => {
      const { user } = setup();
      await user.type(await screen.findByPlaceholderText(SEARCH), query);
      expect(await screen.findByText(/Mar 10/)).toBeTruthy();
      expect(screen.queryByText("Wave notes")).toBeNull();
    },
  );

  it.each(["mon", "mar 11", "9pm"])("does not find the session by %s", async (query) => {
    const { user } = setup();
    await user.type(await screen.findByPlaceholderText(SEARCH), query);
    expect(await screen.findByText("No matches.")).toBeTruthy();
  });

  it("still finds a note by its title and by its key", async () => {
    const { user } = setup();
    const box = await screen.findByPlaceholderText(SEARCH);
    await user.type(box, "wave");
    expect(await screen.findByText("Wave notes")).toBeTruthy();
    await user.clear(box);
    await user.type(box, "nte-1");
    expect(await screen.findByText("Wave notes")).toBeTruthy();
  });
});
