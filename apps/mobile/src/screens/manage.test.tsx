import {
  createPage,
  createSpace,
  createSubtask,
  createTask,
  getEntity,
  getTask,
  listSpaces,
  listSubtasks,
  spaceModules,
  trashEntity,
} from "@nookly/shared/data";
import { Alert } from "react-native";
import { router } from "expo-router";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { IconPickerScreen } from "./IconPicker.tsx";
import { MoveScreen } from "./MoveScreen.tsx";
import { SpaceSettingsScreen } from "./SpaceSettings.tsx";
import { TrashScreen } from "./TrashScreen.tsx";

/// A home screen to come back to, with the screen under test pushed on top of it.
async function openOver(
  routes: Record<string, () => React.JSX.Element>,
  data: ReturnType<typeof testData>,
  url: string,
) {
  const screen = await renderScreens({ index: () => <Text>Home</Text>, ...routes }, data);
  await act(() => router.push(url));
  return screen;
}

/// Presses the button of an alert with the given text, as a person would.
function answerAlert(spy: jest.SpyInstance, text: string) {
  const buttons = spy.mock.calls.at(-1)?.[2] ?? [];
  const button = buttons.find((b: { text?: string }) => b.text === text);
  if (!button?.onPress) throw new Error(`no ${text} in the alert`);
  button.onPress();
}

describe("a task's effort and sub-tasks", () => {
  it("takes an estimate, and shows it as the scale says", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const task = await createTask(data.db, space, "Write report");
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={task} /> },
      data,
      `/entity/${task}`,
    );
    await fireEvent.press(await screen.findByRole("radio", { name: "M" }));
    await waitFor(async () => expect((await getTask(data.db, task))?.effort).toBe(3));
    await fireEvent.press(screen.getByRole("radio", { name: "None" }));
    await waitFor(async () => expect((await getTask(data.db, task))?.effort).toBeNull());
  });

  it("adds a sub-task and shows how far along they are", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const task = await createTask(data.db, space, "Parent");
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={task} /> },
      data,
      `/entity/${task}`,
    );
    await fireEvent.changeText(await screen.findByLabelText("New sub-task"), "First step");
    await fireEvent.press(screen.getByRole("button", { name: "Add Sub-task" }));
    await waitFor(async () =>
      expect((await listSubtasks(data.db, task)).map((t) => t.entity.title)).toEqual([
        "First step",
      ]),
    );
    expect(await screen.findByText("First step", { exact: false })).toBeTruthy();
    expect(await screen.findByText("Sub-tasks, 0% done")).toBeTruthy();
  });
});

describe("Space settings", () => {
  it("renames, removes a module with a choice, adds one back, and deletes only after asking", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    await createTask(data.db, space, "Task");
    await createPage(data.db, space, "note", "Note");
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await openOver(
      { "space-settings": () => <SpaceSettingsScreen spaceId={space} /> },
      data,
      "/space-settings",
    );
    const name = await screen.findByLabelText("Name");
    await fireEvent.changeText(name, "Office");
    await fireEvent(name, "endEditing");
    await waitFor(async () => expect((await listSpaces(data.db))[0].name).toBe("Office"));
    await fireEvent.press(screen.getByRole("button", { name: "Remove Tasks" }));
    answerAlert(alert, "Hide");
    await waitFor(async () => expect(await spaceModules(data.db, space)).toEqual(["notes"]));
    await fireEvent.press(await screen.findByRole("radio", { name: "Tasks" }));
    await waitFor(async () => expect(await spaceModules(data.db, space)).toContain("tasks"));
    await fireEvent.press(screen.getByRole("button", { name: "Delete Space" }));
    expect((await listSpaces(data.db)).length).toBe(1);
    answerAlert(alert, "Delete Forever");
    await waitFor(async () => expect(await listSpaces(data.db)).toEqual([]));
    alert.mockRestore();
  });
});

describe("the icon picker", () => {
  async function pickerFor(data: ReturnType<typeof testData>, page: string) {
    return openOver(
      { "pick/icon": () => <IconPickerScreen /> },
      data,
      `/pick/icon?kind=entity&id=${page}`,
    );
  }

  it("gives an item a library icon", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const page = await createPage(data.db, space, "note", "Note");
    const screen = await pickerFor(data, page);
    await fireEvent.press(await screen.findByRole("button", { name: "Star" }));
    await waitFor(async () => expect((await getEntity(data.db, page))?.icon).toBe("icon:Star"));
  });

  it("tints it when a color is chosen first", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const page = await createPage(data.db, space, "note", "Note");
    const screen = await pickerFor(data, page);
    const tints = await screen.findAllByRole("radio", { name: /^Tint #/ });
    await fireEvent.press(tints[0]);
    await fireEvent.press(screen.getByRole("button", { name: "Heart" }));
    await waitFor(async () =>
      expect((await getEntity(data.db, page))?.icon).toMatch(/^icon:Heart#[0-9a-f]{6}$/i),
    );
  });

  it("gives an item an emoji found by name", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const page = await createPage(data.db, space, "note", "Note");
    const screen = await pickerFor(data, page);
    await fireEvent.press(await screen.findByRole("radio", { name: "Emoji" }));
    await fireEvent.changeText(screen.getByLabelText("Search emoji"), "rocket");
    await fireEvent.press(await screen.findByRole("button", { name: "rocket" }));
    await waitFor(async () => expect((await getEntity(data.db, page))?.icon).toBe("🚀"));
  });
});

describe("moving an item", () => {
  it("lists the other Spaces and moves the item with its sub-tasks", async () => {
    const data = testData();
    const from = await createSpace(data.db, "From", "#3b82f6");
    const to = await createSpace(data.db, "To", "#22c55e");
    const task = await createTask(data.db, from, "Task");
    const sub = await createSubtask(data.db, task, "Sub");
    const screen = await openOver(
      { "new/move": () => <MoveScreen /> },
      data,
      `/new/move?entityId=${task}`,
    );
    expect(screen.queryByRole("button", { name: "From" })).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "To" }));
    await waitFor(async () => expect((await getEntity(data.db, sub))?.spaceId).toBe(to));
  });
});

describe("Trash", () => {
  it("empties only after asking", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const task = await createTask(data.db, space, "Old");
    await trashEntity(data.db, task);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await renderScreens({ index: () => <TrashScreen /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Empty Trash" }));
    expect(await getEntity(data.db, task)).not.toBeNull();
    answerAlert(alert, "Empty Trash");
    await waitFor(async () => expect(await getEntity(data.db, task)).toBeNull());
    alert.mockRestore();
  });
});
