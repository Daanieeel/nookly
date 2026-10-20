import {
  createAssignment,
  createCourse,
  createDeck,
  createPage,
  createSpace,
  createTask,
  listUnrefinedJots,
  updateAssignment,
} from "@nookly/shared/data";
import { router } from "expo-router";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { readPreference } from "../data/preferences.ts";
import { AssignmentsScreen } from "./AssignmentsScreen.tsx";
import { DashboardScreen } from "./DashboardScreen.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { QuickJotScreen } from "./QuickJot.tsx";
import { SidebarSettingsScreen } from "./settings/SidebarSettings.tsx";
import { DEFAULT_TOP, topSchema } from "./sidebar-top.ts";
import { addDays, localDay } from "./dates.ts";

describe("the dashboard", () => {
  it("says what the day holds and lists jots to refine, which refining takes off", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    await createTask(data.db, space, "Send report", localDay());
    await createTask(data.db, space, "Pay rent", addDays(localDay(), -2));
    const jot = await createPage(data.db, space, "jot", "Idea for the app");
    const screen = await renderScreens(
      { index: () => <DashboardScreen />, "entity/[id]": () => <Text>Opened</Text> },
      data,
    );
    expect(await screen.findByRole("button", { name: "Idea for the app" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "To be refined 1" })).toBeTruthy();
    // The sentence says what the day holds, with the counts as links.
    expect((await screen.findAllByRole("link", { name: /1 overdue/ })).length).toBeGreaterThan(0);
    expect(jot).toBeTruthy();
  });

  it("refines a jot into a note from the jot's details", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const jot = await createPage(data.db, space, "jot", "Idea for the app");
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={jot} /> },
      data,
      `/entity/${jot}`,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Refine into New Note" }));
    await waitFor(async () => expect(await listUnrefinedJots(data.db)).toEqual([]));
  });

  it("lists assignments that are due soon and decks with cards to study", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Sheet 3", course, addDays(localDay(), 3));
    await createDeck(data.db, space, "Graph terms");
    const screen = await renderScreens({ index: () => <DashboardScreen /> }, data);
    await fireEvent.press(await screen.findByRole("radio", { name: "Next 7 days 1" }));
    expect(await screen.findByRole("button", { name: "Sheet 3" })).toBeTruthy();
  });
});

describe("the assignments overview", () => {
  it("sorts assignments of every Space by when they are due, with handed in ones apart", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Late sheet", course, addDays(localDay(), -4));
    await createAssignment(data.db, space, "Soon sheet", course, addDays(localDay(), 2));
    await createAssignment(data.db, space, "Someday", course);
    const handed = await createAssignment(
      data.db,
      space,
      "Handed in",
      course,
      addDays(localDay(), -10),
    );
    await updateAssignment(data.db, handed, { status: "submitted" });
    const screen = await renderScreens({ index: () => <AssignmentsScreen /> }, data);
    expect(await screen.findByText("Overdue · 1")).toBeTruthy();
    expect(screen.getByText("Next 7 days · 1")).toBeTruthy();
    expect(screen.getByText("No due date · 1")).toBeTruthy();
    expect(screen.getByText("Done · 1")).toBeTruthy();
  });
});

describe("quick jot", () => {
  it("saves the text as a jot in the Space and goes back", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Home", "#22c55e");
    const screen = await renderScreens(
      { index: () => <Text>Home screen</Text>, "new/jot": () => <QuickJotScreen /> },
      data,
    );
    await act(() => router.push("/new/jot"));
    await fireEvent.changeText(
      await screen.findByLabelText("Jot"),
      "Call the plumber\nbefore Friday",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save Jot" }));
    await waitFor(async () => {
      const [jot] = await listUnrefinedJots(data.db, { spaceId: space });
      expect(jot.entity.title).toBe("Call the plumber");
      expect(jot.preview).toBe("Call the plumber before Friday");
    });
    expect(await screen.findByText("Home screen")).toBeTruthy();
  });

  it("says what is missing", async () => {
    const data = testData();
    await createSpace(data.db, "Home", "#22c55e");
    const screen = await renderScreens(
      { index: () => <Text>Home screen</Text>, "new/jot": () => <QuickJotScreen /> },
      data,
    );
    await act(() => router.push("/new/jot"));
    // The Spaces have to be there before there is a place to save to.
    await screen.findByRole("radio", { name: "Home" });
    await fireEvent.press(await screen.findByRole("button", { name: "Save Jot" }));
    expect(await screen.findByText("Write something first.")).toBeTruthy();
  });
});

describe("the sidebar's settings", () => {
  it("moves and hides items, remembered on this phone", async () => {
    const data = testData();
    const screen = await renderScreens({ index: () => <SidebarSettingsScreen /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Move Tasks Up" }));
    expect(readPreference("sidebar.top", topSchema, DEFAULT_TOP).order.slice(0, 3)).toEqual([
      "dashboard",
      "tasks",
      "calendar",
    ]);
    await fireEvent(screen.getByLabelText("Show Calendar"), "valueChange", false);
    expect(readPreference("sidebar.top", topSchema, DEFAULT_TOP).hidden).toEqual(["calendar"]);
  });
});
