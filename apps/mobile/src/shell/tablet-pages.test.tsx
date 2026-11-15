import { createSpace } from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { Text } from "react-native";
import { barLabels, renderScreens, testData } from "../test/render.tsx";
import { CalendarScreen } from "../screens/CalendarScreen.tsx";
import { TasksScreen } from "../screens/TasksScreen.tsx";
import { SettingsScreen } from "../screens/SettingsScreen.tsx";

/// An iPad wide, as the tablet shell lays it out.
const IPAD = { width: 1100 };

// The tablet is the desktop made for touch: a page's actions are labelled buttons in its own
// header row, as the desktop's "New task", not round buttons in a phone's bar.
describe("a page's actions on a tablet", () => {
  it("are labelled buttons in the list's header, not in the bar", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await renderScreens(
      {
        index: () => <TasksScreen spaceId={space} />,
        "new/task": () => <Text>New task form</Text>,
      },
      data,
      "/",
      IPAD,
    );
    expect(await screen.findByText("New Task")).toBeTruthy();
    expect(barLabels(screen)).not.toContain("New Task");
    await fireEvent.press(screen.getByRole("button", { name: "New Task" }));
    expect(await screen.findByText("New task form")).toBeTruthy();
  });

  it("sit at the top of a page without a list header", async () => {
    const data = testData();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data, "/", IPAD);
    expect(await screen.findByText("New Calendar Entry")).toBeTruthy();
    expect(barLabels(screen)).not.toContain("New Calendar Entry");
  });

  it("stay in the bar on a phone", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await renderScreens({ index: () => <TasksScreen spaceId={space} /> }, data);
    await screen.findByText("Tasks");
    expect(barLabels(screen)).toContain("New Task");
    expect(screen.queryByText("New Task")).toBeNull();
  });
});

// The desktop's Settings lists its sections beside the one shown; a tablet does the same
// instead of pushing a page for each section, as a phone does.
describe("Settings on a tablet", () => {
  it("shows the picked section beside the list of sections", async () => {
    const screen = await renderScreens(
      {
        index: () => <SettingsScreen />,
        "settings/[page]": () => <Text>Pushed a page</Text>,
      },
      testData(),
      "/",
      IPAD,
    );
    // General is shown to begin with.
    expect(await screen.findByRole("header", { name: "General" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Appearance/ }));
    expect(await screen.findByRole("header", { name: "Appearance" })).toBeTruthy();
    expect(screen.getAllByRole("radio", { name: "Dark" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Pushed a page")).toBeNull();
  });

  it("pushes each section as its own page on a phone", async () => {
    const screen = await renderScreens(
      {
        index: () => <SettingsScreen />,
        "settings/[page]": () => <Text>Pushed a page</Text>,
      },
      testData(),
    );
    await fireEvent.press(await screen.findByRole("button", { name: /^Appearance/ }));
    expect(await screen.findByText("Pushed a page")).toBeTruthy();
  });
});
