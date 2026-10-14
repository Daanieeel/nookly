import {
  createPage,
  createSpace,
  createTask,
  getTask,
  listBlocks,
  listTasks,
  markOpened,
  setTaskStatus,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { ApiClient } from "@nookly/shared/api";
import { renderScreens, testData } from "../test/render.tsx";
import { ShareScreen } from "./ShareScreen.tsx";
import { DashboardScreen } from "./DashboardScreen.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { NewTaskScreen } from "./NewScreens.tsx";
import { SearchScreen } from "./SearchScreen.tsx";
import { SettingsScreen } from "./SettingsScreen.tsx";
import { TasksScreen } from "./TasksScreen.tsx";
import { localDay } from "./dates.ts";

async function seeded() {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#0070f3");
  return { data, space };
}

describe("the Tasks tab", () => {
  it("groups every Space's tasks by status and finishes one from the row", async () => {
    const { data, space } = await seeded();
    const id = await createTask(data.db, space, "Write report");
    const done = await createTask(data.db, space, "Old one");
    await setTaskStatus(data.db, done, "done");
    const screen = await renderScreens({ index: () => <TasksScreen /> }, data);
    expect(await screen.findByText("Backlog · 1")).toBeTruthy();
    expect(await screen.findByText("Done · 1")).toBeTruthy();
    // The swipe action, as a screen reader offers it.
    // The row's swipe actions sit on the element that answers accessibility actions.
    let row = screen.getByLabelText("Write report, TSK-1").parent;
    while (row && !row.props.onAccessibilityAction) row = row.parent;
    if (!row) throw new Error("no swipe actions");
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "Done" } });
    await waitFor(async () => expect((await getTask(data.db, id))?.statusId).toBe("done"));
  });
});

describe("making a task", () => {
  it("asks for a title, then creates one after another", async () => {
    const { data } = await seeded();
    const screen = await renderScreens({ index: () => <NewTaskScreen /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Create" }));
    expect(await screen.findByText("Give it a title")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Title"), "Call the dentist");
    await fireEvent.press(screen.getByRole("button", { name: "Create" }));
    await waitFor(async () =>
      expect((await listTasks(data.db)).map((t) => t.entity.title)).toEqual(["Call the dentist"]),
    );
    await waitFor(() => expect(screen.getByLabelText("Title").props.value).toBe(""));
  });
});

describe("a page", () => {
  it("edits its blocks as text and saves when done typing", async () => {
    const { data, space } = await seeded();
    const page = await createPage(data.db, space, "note", "Physics");
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={page} /> },
      data,
      `/entity/${page}`,
    );
    const block = await screen.findByLabelText("Text block");
    await fireEvent.changeText(block, "Waves move energy");
    await fireEvent(block, "endEditing");
    await waitFor(async () =>
      expect((await listBlocks(data.db, page))[0].content).toBe("Waves move energy"),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Move to Trash" }));
    expect(await screen.findByText("In Trash")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
  });
});

describe("search", () => {
  it("shows Recents first, then what matches", async () => {
    const { data, space } = await seeded();
    const id = await createTask(data.db, space, "Renew passport");
    await createTask(data.db, space, "Buy milk");
    await markOpened(data.db, id);
    const screen = await renderScreens({ index: () => <SearchScreen /> }, data);
    expect(await screen.findByText("Recents")).toBeTruthy();
    expect(await screen.findByText("Renew passport")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Search"), "milk");
    expect(await screen.findByText("Buy milk")).toBeTruthy();
    expect(screen.queryByText("Renew passport")).toBeNull();
  });
});

describe("the Dashboard", () => {
  it("lists what is due today and before", async () => {
    const { data, space } = await seeded();
    await createTask(data.db, space, "Due today", localDay());
    await createTask(data.db, space, "Some day");
    const screen = await renderScreens({ index: () => <DashboardScreen /> }, data);
    expect(await screen.findByText("Due today")).toBeTruthy();
    expect(screen.queryByText("Some day")).toBeNull();
    expect(screen.getByText("Nothing on the calendar today.")).toBeTruthy();
  });
});

describe("Settings", () => {
  it("says sync is optional and checks the sign in form", async () => {
    const { data } = await seeded();
    const screen = await renderScreens({ index: () => <SettingsScreen /> }, data);
    expect(await screen.findByText(/It is optional/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Server"), "not a server");
    await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("Enter an address like https://sync.example.com")).toBeTruthy();
    expect(screen.getByText("Enter your username or email")).toBeTruthy();
  });
});

describe("sharing from the phone", () => {
  it("invites someone to a page", async () => {
    const { data, space } = await seeded();
    const page = await createPage(data.db, space, "note", "Trip");
    const api = new ApiClient({
      baseUrl: "https://sync.example.com",
      tokens: { load: async () => null, save: async () => {} },
    });
    jest.spyOn(api, "sharesByMe").mockResolvedValue([]);
    const share = jest.spyOn(api, "share").mockResolvedValue({
      share: {
        id: "00000000-0000-4000-8000-0000000000aa",
        entityId: page,
        entityType: "note",
        title: "Trip",
        role: "editor",
        status: "pending",
        owner: "ada",
        recipient: "ben@example.com",
        createdAt: "",
      },
      inviteUrl: "https://sync.example.com/invite?token=x",
    });
    jest.spyOn(data.sync, "account").mockReturnValue(api);
    jest.spyOn(data.sync, "syncNow").mockResolvedValue();
    data.sync.store.setState({
      user: {
        id: "00000000-0000-4000-8000-0000000000bb",
        username: "ada",
        email: "a@b.co",
        emailVerified: true,
        createdAt: "",
      },
    });
    const screen = await renderScreens({ index: () => <ShareScreen entityId={page} /> }, data);
    await fireEvent.changeText(screen.getByLabelText("Email"), "Ben@Example.com");
    await fireEvent.press(screen.getByRole("radio", { name: "Can edit" }));
    await fireEvent.press(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(page, "ben@example.com", "editor"));
  });
});
