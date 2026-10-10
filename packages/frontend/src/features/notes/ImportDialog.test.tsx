import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Toaster } from "@nookly/ui/components/sonner";
import { beforeEach, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeEntity, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { ImportButton, ImportDialog } from "./ImportDialog.tsx";

const PREVIEW = {
  format: "nookly-page",
  kind: "note",
  title: "Physics",
  facts: [],
  count: 2,
  countLabel: "block",
  converted: 0,
  parentType: null,
  items: [
    { label: "heading1", text: "Waves", converted: false },
    { label: "paragraph", text: "Light is a wave", converted: false },
  ],
};

const COURSE = makeEntity({
  id: "course-1",
  spaceId: "space-1",
  type: "course",
  title: "Physics 101",
});

async function openDialog(entities = [COURSE]) {
  mockCommand("list_spaces", [
    makeSpace({ id: "space-1", name: "Home" }),
    makeSpace({ id: "space-2", name: "School" }),
  ]);
  mockCommand("list_relationship_types", [
    {
      name: "relates-to",
      label: "Relates to",
      inverseLabel: "relates to",
      description: "A loose link",
      fromType: null,
      toType: null,
    },
  ]);
  mockCommand("list_entities", entities);
  useNavStore.setState({ activeSpaceId: "space-1" });
  const view = renderWithProviders(
    <>
      <ImportButton />
      <ImportDialog />
      <Toaster />
    </>,
  );
  await view.user.click(screen.getByRole("button", { name: "Import" }));
  return view;
}

async function chooseFile(user: Awaited<ReturnType<typeof openDialog>>["user"]) {
  await user.click(await screen.findByRole("button", { name: "Choose File" }));
}

function jsonFile(name = "Physics.nookly.json", text = '{"format":"nookly-page"}'): File {
  return new File([text], name, { type: "application/json" });
}

describe("ImportButton", () => {
  beforeEach(() => {
    useNavStore.setState({ importOpen: false });
    // The toaster reads the color scheme.
    window.matchMedia = (media) => ({
      matches: false,
      media,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    });
    mockCommand("plugin:dialog|open", "/tmp/Physics.nookly.json");
    mockCommand("preview_entity_json", PREVIEW);
    mockCommand("preview_entity_text", PREVIEW);
  });

  describe("opening", () => {
    it("opens with Cmd or Ctrl+I from anywhere that is not a text field", async () => {
      const { user } = renderWithProviders(<ImportDialog />);
      expect(screen.queryByRole("dialog")).toBeNull();
      await user.keyboard("{Control>}i{/Control}");
      expect(await screen.findByRole("dialog", { name: "Import" })).toBeInTheDocument();
    });

    it("leaves the key to the editor while typing, where it is italic", async () => {
      const { user } = renderWithProviders(
        <>
          <input aria-label="Title" />
          <ImportDialog />
        </>,
      );
      await user.click(screen.getByRole("textbox", { name: "Title" }));
      await user.keyboard("{Control>}i{/Control}");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("shows the shortcut on the titlebar button's tooltip", async () => {
      const { user } = renderWithProviders(<ImportButton />);
      await user.hover(screen.getByRole("button", { name: "Import" }));
      expect((await screen.findAllByText("I")).length).toBeGreaterThan(0);
    });
  });

  describe("step 1", () => {
    it("is a drop zone with the accepted formats and the space chip, and no Cancel", async () => {
      await openDialog();
      expect(await screen.findByRole("dialog", { name: "Import" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Choose File" })).toBeInTheDocument();
      expect(screen.getByText(/Drop a file here/)).toBeInTheDocument();
      expect(screen.getByText("Nookly file (.json)")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Space" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Import (Note|Jot)/ })).toBeNull();
      await expectNoA11yViolations();
    });

    it("closes on Escape", async () => {
      const { user } = await openDialog();
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("stays on the file step when the file dialog is cancelled", async () => {
      mockCommand("plugin:dialog|open", null);
      const { user } = await openDialog();
      await chooseFile(user);
      await waitFor(() => expect(callsOf("plugin:dialog|open")).toHaveLength(1));
      expect(callsOf("preview_entity_json")).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Choose File" })).toBeInTheDocument();
    });

    it("shows why a file is refused and offers another choice", async () => {
      mockCommandWith("preview_entity_json", () => {
        throw new Error("this is not a Nookly page file");
      });
      const { user } = await openDialog();
      await chooseFile(user);
      expect(await screen.findByRole("alert")).toHaveTextContent("this is not a Nookly page file");
      expect(screen.getByRole("button", { name: "Choose File" })).toBeInTheDocument();
    });

    it("takes a dropped file through the text commands", async () => {
      mockCommand(
        "import_entity_text",
        makeEntity({ id: "new-1", type: "note", title: "Physics" }),
      );
      await openDialog();
      const zone = await screen.findByTestId("import-drop-zone");
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: { files: [jsonFile()] } });
      });
      expect(await screen.findByText(/Note "Physics"/)).toBeInTheDocument();
      expect(callsOf("preview_entity_text")[0]).toEqual({ text: '{"format":"nookly-page"}' });
      expect(callsOf("preview_entity_json")).toHaveLength(0);
    });

    it("refuses a dropped file that is not a page file, without asking the backend", async () => {
      await openDialog();
      const zone = await screen.findByTestId("import-drop-zone");
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: { files: [jsonFile("notes.txt", "hello")] } });
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(/Nookly file \(\.json\)/);
      expect(callsOf("preview_entity_text")).toHaveLength(0);
    });

    it("takes pasted page text", async () => {
      await openDialog();
      const dialog = await screen.findByRole("dialog");
      await act(async () => {
        fireEvent.paste(dialog, {
          clipboardData: { files: [], getData: () => '{"format":"nookly-page"}' },
        });
      });
      expect(await screen.findByText(/Note "Physics"/)).toBeInTheDocument();
      expect(callsOf("preview_entity_text")).toHaveLength(1);
    });
  });

  describe("step 2", () => {
    it("keeps the space chip, and the dialog stays as wide", async () => {
      const { user } = await openDialog();
      const before = (await screen.findByRole("dialog")).className;
      await chooseFile(user);
      await screen.findByText(/Note "Physics"/);
      expect(screen.getByRole("combobox", { name: "Space" })).toBeInTheDocument();
      expect(screen.getByRole("dialog").className).toBe(before);
      await expectNoA11yViolations();
    });

    it("lists the blocks behind a toggle, so the file can be checked first", async () => {
      const { user } = await openDialog();
      await chooseFile(user);
      const toggle = await screen.findByRole("button", { name: /2 blocks/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Light is a wave")).toBeNull();
      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Light is a wave")).toBeInTheDocument();
      expect(screen.getByText("Waves")).toBeInTheDocument();
      expect(screen.getByText("Heading 1")).toBeInTheDocument();
    });

    it("marks a block this version converts", async () => {
      mockCommand("preview_entity_json", {
        ...PREVIEW,
        converted: 1,
        items: [{ label: "hologram", text: "still here", converted: true }],
        count: 1,
      });
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: /1 block/ }));
      expect(screen.getByText(/becomes a paragraph/)).toBeInTheDocument();
    });

    it("names the button after what is imported", async () => {
      mockCommand("preview_entity_json", { ...PREVIEW, kind: "jot" });
      const { user } = await openDialog();
      await chooseFile(user);
      expect(await screen.findByRole("button", { name: "Import Jot" })).toBeInTheDocument();
    });

    it("marks relations optional and says how they differ from the space", async () => {
      const { user } = await openDialog();
      await chooseFile(user);
      expect(await screen.findByText("(optional)")).toBeInTheDocument();
      expect(screen.getByText(/the space is where it is stored/i)).toBeInTheDocument();
    });

    it("suggests matching items as chips and links nothing until one is clicked", async () => {
      mockCommand(
        "import_entity_json",
        makeEntity({ id: "new-1", type: "note", title: "Physics" }),
      );
      mockCommand("create_relationship", {});
      mockCommand("touch_entity_opened", null);
      const { user } = await openDialog();
      await chooseFile(user);
      const chip = await screen.findByRole("button", { name: /Physics 101/ });
      expect(callsOf("create_relationship")).toHaveLength(0);
      await user.click(chip);
      // The chip turns into a chosen relation.
      expect(screen.getByRole("button", { name: "Remove relation" })).toBeInTheDocument();
      expect(callsOf("create_relationship")).toHaveLength(0);
      await user.click(screen.getByRole("button", { name: "Import Note" }));
      await waitFor(() => expect(callsOf("create_relationship")).toHaveLength(1));
      expect(callsOf("create_relationship")[0]).toMatchObject({
        fromEntityId: "new-1",
        toEntityId: "course-1",
        relationshipType: "relates-to",
      });
    });

    it("imports into the Space the user picks", async () => {
      mockCommand(
        "import_entity_json",
        makeEntity({ id: "new-1", spaceId: "space-2", type: "note" }),
      );
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("combobox", { name: "Space" }));
      await user.click(await screen.findByRole("option", { name: "School" }));
      await user.click(screen.getByRole("button", { name: "Import Note" }));
      await waitFor(() => expect(callsOf("import_entity_json")).toHaveLength(1));
      expect(callsOf("import_entity_json")[0]).toEqual({
        spaceId: "space-2",
        path: "/tmp/Physics.nookly.json",
        parentId: null,
      });
    });

    it("drops a chosen relation again", async () => {
      mockCommand("import_entity_json", makeEntity({ id: "new-1", type: "note" }));
      mockCommand("create_relationship", {});
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: /Physics 101/ }));
      await user.click(await screen.findByRole("button", { name: "Remove relation" }));
      await user.click(screen.getByRole("button", { name: "Import Note" }));
      await waitFor(() => expect(callsOf("import_entity_json")).toHaveLength(1));
      expect(callsOf("create_relationship")).toHaveLength(0);
    });

    it("lets the user relate to any item through the picker", async () => {
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Relate to..." }));
      await user.click(await screen.findByRole("option", { name: /^Course/ }));
      expect((await screen.findAllByText("Physics 101")).length).toBeGreaterThan(0);
    });
  });

  describe("duplicates", () => {
    const SAME = makeEntity({ id: "old-1", spaceId: "space-1", type: "note", title: "physics" });

    it("warns before importing, and offers a copy or a skip", async () => {
      mockCommand("import_entity_json", makeEntity({ id: "new-1", type: "note" }));
      const { user } = await openDialog([SAME]);
      await chooseFile(user);
      expect(await screen.findByText("Already in this space")).toBeInTheDocument();
      expect(screen.getAllByText("physics").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Import Note" })).toBeNull();
      expect(callsOf("import_entity_json")).toHaveLength(0);
    });

    it("imports a copy, titled as one", async () => {
      mockCommand(
        "import_entity_json",
        makeEntity({ id: "new-1", type: "note", title: "Physics" }),
      );
      mockCommand("update_entity", makeEntity({ id: "new-1", title: "Physics (copy)" }));
      const { user } = await openDialog([SAME]);
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Import as copy" }));
      await waitFor(() => expect(callsOf("update_entity")).toHaveLength(1));
      expect(callsOf("update_entity")[0]).toMatchObject({
        id: "new-1",
        patch: { title: "Physics (copy)" },
      });
    });

    it("skips by going back to the file step without importing", async () => {
      const { user } = await openDialog([SAME]);
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Skip" }));
      expect(await screen.findByRole("button", { name: "Choose File" })).toBeInTheDocument();
      expect(callsOf("import_entity_json")).toHaveLength(0);
    });

    it("does not warn about another type or another space", async () => {
      const { user } = await openDialog([makeEntity({ id: "t", type: "task", title: "Physics" })]);
      await chooseFile(user);
      expect(await screen.findByRole("button", { name: "Import Note" })).toBeInTheDocument();
    });
  });

  describe("after the import", () => {
    it("confirms with a toast that opens the new item, and does not navigate by itself", async () => {
      mockCommand(
        "import_entity_json",
        makeEntity({ id: "new-1", spaceId: "space-1", type: "note", title: "Physics" }),
      );
      mockCommand("touch_entity_opened", null);
      useNavStore.setState({ view: { kind: "dashboard" } });
      const { user } = await openDialog([]);
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Import Note" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(useNavStore.getState().view.kind).toBe("dashboard");
      await user.click((await screen.findAllByRole("button", { name: /^Open / }))[0]);
      expect(useNavStore.getState().view).toMatchObject({ kind: "entity", entityId: "new-1" });
    });

    it("keeps the file selected and shows the error when the import fails", async () => {
      mockCommandWith("import_entity_json", () => {
        throw new Error("block 2: not valid");
      });
      const { user } = await openDialog([]);
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Import Note" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("block 2: not valid");
      expect(screen.getByText(/Note "Physics"/)).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getAllByText("Try Again").length).toBeGreaterThan(0);
    });

    it("still imports and closes when a link fails", async () => {
      mockCommand(
        "import_entity_json",
        makeEntity({ id: "new-1", type: "note", title: "Physics" }),
      );
      mockCommandWith("create_relationship", () => {
        throw new Error("nope");
      });
      mockCommand("touch_entity_opened", null);
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: /Physics 101/ }));
      await user.click(screen.getByRole("button", { name: "Import Note" }));
      await waitFor(() => expect(callsOf("create_relationship")).toHaveLength(1));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(await screen.findByText(/1 link could not be made/)).toBeInTheDocument();
    });

    it("imports a dropped file with the text command", async () => {
      mockCommand(
        "import_entity_text",
        makeEntity({ id: "new-1", type: "note", title: "Physics" }),
      );
      const { user } = await openDialog([]);
      const zone = await screen.findByTestId("import-drop-zone");
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: { files: [jsonFile()] } });
      });
      await user.click(await screen.findByRole("button", { name: "Import Note" }));
      await waitFor(() => expect(callsOf("import_entity_text")).toHaveLength(1));
      expect(callsOf("import_entity_text")[0]).toEqual({
        spaceId: "space-1",
        text: '{"format":"nookly-page"}',
        parentId: null,
      });
      expect(callsOf("import_entity_json")).toHaveLength(0);
    });
  });

  describe("other kinds of file", () => {
    const TASK = {
      format: "nookly-task",
      kind: "task",
      title: "Write the report",
      facts: ["Status: In Progress", "Due 2026-03-10", "Effort 5"],
      count: 2,
      countLabel: "subtask",
      converted: 0,
      parentType: null,
      items: [
        { label: "Done", text: "Outline", converted: false },
        { label: "Backlog", text: "Draft", converted: false },
      ],
    };
    const DECK = {
      format: "nookly-deck",
      kind: "deck",
      title: "Physics terms",
      facts: ["Cards arrive as new, with no review history"],
      count: 3,
      countLabel: "card",
      converted: 0,
      parentType: null,
      items: [{ label: "Card", text: "Force", converted: false }],
    };
    const ASSIGNMENT = {
      format: "nookly-assignment",
      kind: "assignment",
      title: "Lab report 3",
      facts: ["Status: Graded", "Due 2026-03-10"],
      count: 1,
      countLabel: "block",
      converted: 0,
      parentType: "course",
      items: [{ label: "paragraph", text: "Hand in both parts", converted: false }],
    };

    it("shows a task with its facts and its subtasks, and names the button after it", async () => {
      mockCommand("preview_entity_json", TASK);
      const { user } = await openDialog();
      await chooseFile(user);
      expect(await screen.findByText(/Task "Write the report"/)).toBeInTheDocument();
      expect(screen.getByText(/Status: In Progress/)).toBeInTheDocument();
      expect(screen.getByText(/Effort 5/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /2 subtasks/ }));
      expect(screen.getByText("Outline")).toBeInTheDocument();
      expect(screen.getByText("Done")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Import Task" })).toBeInTheDocument();
      // A task needs no parent.
      expect(screen.queryByText(/File under/)).toBeNull();
    });

    it("imports a task into the chosen Space", async () => {
      mockCommand("preview_entity_json", TASK);
      mockCommand("import_entity_json", makeEntity({ id: "t-new", type: "task", title: "Write" }));
      mockCommand("touch_entity_opened", null);
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Import Task" }));
      await waitFor(() => expect(callsOf("import_entity_json")).toHaveLength(1));
      expect(callsOf("import_entity_json")[0]).toEqual({
        spaceId: "space-1",
        path: "/tmp/Physics.nookly.json",
        parentId: null,
      });
    });

    it("shows a deck with its cards and the cards count", async () => {
      mockCommand("preview_entity_json", DECK);
      const { user } = await openDialog();
      await chooseFile(user);
      expect(await screen.findByText(/Deck "Physics terms"/)).toBeInTheDocument();
      expect(screen.getByText(/no review history/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /3 cards/ }));
      expect(screen.getByText("Force")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Import Deck" })).toBeInTheDocument();
    });

    it("warns about a duplicate deck by its own type, not another type's title", async () => {
      mockCommand("preview_entity_json", DECK);
      const { user } = await openDialog([
        makeEntity({ id: "d-old", type: "index_card_deck", title: "Physics terms" }),
      ]);
      await chooseFile(user);
      expect(await screen.findByText("Already in this space")).toBeInTheDocument();
    });

    it("does not call a note with the same title a duplicate of a deck", async () => {
      mockCommand("preview_entity_json", DECK);
      const { user } = await openDialog([
        makeEntity({ id: "n-old", type: "note", title: "Physics terms" }),
      ]);
      await chooseFile(user);
      expect(await screen.findByRole("button", { name: "Import Deck" })).toBeInTheDocument();
    });

    it("needs a course for an assignment, and says why", async () => {
      mockCommand("preview_entity_json", ASSIGNMENT);
      const { user } = await openDialog();
      await chooseFile(user);
      expect(await screen.findByText(/Assignment "Lab report 3"/)).toBeInTheDocument();
      expect(screen.getByText(/File under a course/)).toBeInTheDocument();
      expect(screen.getByText(/belongs to one course/)).toBeInTheDocument();
      // Nothing to confirm until a course is chosen.
      expect(screen.getByRole("button", { name: "Import Assignment" })).toBeDisabled();
    });

    it("files an assignment under the course that was chosen", async () => {
      mockCommand("preview_entity_json", ASSIGNMENT);
      mockCommand("import_entity_json", makeEntity({ id: "a-new", type: "assignment" }));
      mockCommand("touch_entity_opened", null);
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: /Choose a course/ }));
      await user.click(await screen.findByText("Physics 101"));
      const button = screen.getByRole("button", { name: "Import Assignment" });
      expect(button).toBeEnabled();
      await user.click(button);
      await waitFor(() => expect(callsOf("import_entity_json")).toHaveLength(1));
      expect(callsOf("import_entity_json")[0]).toEqual({
        spaceId: "space-1",
        path: "/tmp/Physics.nookly.json",
        parentId: "course-1",
      });
    });

    it("forgets the course when the Space changes, since it belongs to the other one", async () => {
      mockCommand("preview_entity_json", ASSIGNMENT);
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: /Choose a course/ }));
      await user.click(await screen.findByText("Physics 101"));
      expect(screen.getByRole("button", { name: "Import Assignment" })).toBeEnabled();
      await user.click(screen.getByRole("combobox", { name: "Space" }));
      await user.click(await screen.findByRole("option", { name: "School" }));
      expect(screen.getByRole("button", { name: "Import Assignment" })).toBeDisabled();
    });

    it("has no accessibility violations on the assignment step, with its course picker", async () => {
      mockCommand("preview_entity_json", ASSIGNMENT);
      const { user } = await openDialog();
      await chooseFile(user);
      await screen.findByText(/File under a course/);
      await expectNoA11yViolations();
    });

    it("has no accessibility violations on the task step, with its subtasks open", async () => {
      mockCommand("preview_entity_json", TASK);
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: /2 subtasks/ }));
      await expectNoA11yViolations();
    });

    it("does not offer the course relation or the due session as a relation", async () => {
      mockCommand("preview_entity_json", ASSIGNMENT);
      mockCommand("list_relationship_types", [
        {
          name: "assignment-course",
          label: "Assignment for course",
          inverseLabel: "has assignment",
          description: "",
          fromType: "assignment",
          toType: "course",
        },
        {
          name: "relates-to",
          label: "Relates to",
          inverseLabel: "relates to",
          description: "",
          fromType: null,
          toType: null,
        },
      ]);
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Relate to..." }));
      // Relating to a course can only be a plain relation: the assignment's own course type
      // is hidden, so there is one way to link and the step that asks how is skipped.
      await user.click(await screen.findByRole("option", { name: /^Course/ }));
      const trail = await screen.findByRole("navigation", { name: "Relation" });
      expect(trail).toHaveTextContent(/Relates to/);
      expect(trail).not.toHaveTextContent(/Assignment for course/);
    });
  });
});
