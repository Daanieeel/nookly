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
  kind: "note",
  title: "Physics",
  blockCount: 2,
  convertedBlocks: 0,
  blocks: [
    { blockType: "heading1", firstLine: "Waves", converted: false },
    { blockType: "paragraph", firstLine: "Light is a wave", converted: false },
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
    mockCommand("preview_page_json", PREVIEW);
    mockCommand("preview_page_text", PREVIEW);
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
      expect(screen.getByText("Nookly page file (.json)")).toBeInTheDocument();
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
      expect(callsOf("preview_page_json")).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Choose File" })).toBeInTheDocument();
    });

    it("shows why a file is refused and offers another choice", async () => {
      mockCommandWith("preview_page_json", () => {
        throw new Error("this is not a Nookly page file");
      });
      const { user } = await openDialog();
      await chooseFile(user);
      expect(await screen.findByRole("alert")).toHaveTextContent("this is not a Nookly page file");
      expect(screen.getByRole("button", { name: "Choose File" })).toBeInTheDocument();
    });

    it("takes a dropped file through the text commands", async () => {
      mockCommand("import_page_text", makeEntity({ id: "new-1", type: "note", title: "Physics" }));
      await openDialog();
      const zone = await screen.findByTestId("import-drop-zone");
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: { files: [jsonFile()] } });
      });
      expect(await screen.findByText(/Note "Physics"/)).toBeInTheDocument();
      expect(callsOf("preview_page_text")[0]).toEqual({ text: '{"format":"nookly-page"}' });
      expect(callsOf("preview_page_json")).toHaveLength(0);
    });

    it("refuses a dropped file that is not a page file, without asking the backend", async () => {
      await openDialog();
      const zone = await screen.findByTestId("import-drop-zone");
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: { files: [jsonFile("notes.txt", "hello")] } });
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(/Nookly page file \(\.json\)/);
      expect(callsOf("preview_page_text")).toHaveLength(0);
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
      expect(callsOf("preview_page_text")).toHaveLength(1);
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
      mockCommand("preview_page_json", {
        ...PREVIEW,
        convertedBlocks: 1,
        blocks: [{ blockType: "hologram", firstLine: "still here", converted: true }],
        blockCount: 1,
      });
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: /1 block/ }));
      expect(screen.getByText(/becomes a paragraph/)).toBeInTheDocument();
    });

    it("names the button after what is imported", async () => {
      mockCommand("preview_page_json", { ...PREVIEW, kind: "jot" });
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
      mockCommand("import_page_json", makeEntity({ id: "new-1", type: "note", title: "Physics" }));
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
        "import_page_json",
        makeEntity({ id: "new-1", spaceId: "space-2", type: "note" }),
      );
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("combobox", { name: "Space" }));
      await user.click(await screen.findByRole("option", { name: "School" }));
      await user.click(screen.getByRole("button", { name: "Import Note" }));
      await waitFor(() => expect(callsOf("import_page_json")).toHaveLength(1));
      expect(callsOf("import_page_json")[0]).toEqual({
        spaceId: "space-2",
        path: "/tmp/Physics.nookly.json",
      });
    });

    it("drops a chosen relation again", async () => {
      mockCommand("import_page_json", makeEntity({ id: "new-1", type: "note" }));
      mockCommand("create_relationship", {});
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: /Physics 101/ }));
      await user.click(await screen.findByRole("button", { name: "Remove relation" }));
      await user.click(screen.getByRole("button", { name: "Import Note" }));
      await waitFor(() => expect(callsOf("import_page_json")).toHaveLength(1));
      expect(callsOf("create_relationship")).toHaveLength(0);
    });

    it("lets the user relate to any item through the picker", async () => {
      const { user } = await openDialog();
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Relate to..." }));
      await user.click(await screen.findByText("Relates to"));
      expect((await screen.findAllByText("Physics 101")).length).toBeGreaterThan(0);
    });
  });

  describe("duplicates", () => {
    const SAME = makeEntity({ id: "old-1", spaceId: "space-1", type: "note", title: "physics" });

    it("warns before importing, and offers a copy or a skip", async () => {
      mockCommand("import_page_json", makeEntity({ id: "new-1", type: "note" }));
      const { user } = await openDialog([SAME]);
      await chooseFile(user);
      expect(await screen.findByText("Already in this space")).toBeInTheDocument();
      expect(screen.getAllByText("physics").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Import Note" })).toBeNull();
      expect(callsOf("import_page_json")).toHaveLength(0);
    });

    it("imports a copy, titled as one", async () => {
      mockCommand("import_page_json", makeEntity({ id: "new-1", type: "note", title: "Physics" }));
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
      expect(callsOf("import_page_json")).toHaveLength(0);
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
        "import_page_json",
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
      mockCommandWith("import_page_json", () => {
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
      mockCommand("import_page_json", makeEntity({ id: "new-1", type: "note", title: "Physics" }));
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
      mockCommand("import_page_text", makeEntity({ id: "new-1", type: "note", title: "Physics" }));
      const { user } = await openDialog([]);
      const zone = await screen.findByTestId("import-drop-zone");
      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: { files: [jsonFile()] } });
      });
      await user.click(await screen.findByRole("button", { name: "Import Note" }));
      await waitFor(() => expect(callsOf("import_page_text")).toHaveLength(1));
      expect(callsOf("import_page_text")[0]).toEqual({
        spaceId: "space-1",
        text: '{"format":"nookly-page"}',
      });
      expect(callsOf("import_page_json")).toHaveLength(0);
    });
  });
});
