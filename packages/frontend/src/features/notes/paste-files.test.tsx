import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { EditorView } from "@tiptap/pm/view";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Label } from "#/lib/api/types.ts";
import { makeFile, makeLabel } from "#/test/fixtures.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { usePasteFiles } from "./paste-files.tsx";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function fakeView(): EditorView {
  const tr = { replaceSelectionWith: () => tr, scrollIntoView: () => tr };
  // SAFETY: a stub of just the members `handlePaste` touches.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- jsdom has no editor view to build, so the stub is cast through unknown
  return {
    isDestroyed: false,
    coordsAtPos: () => ({ left: 0, bottom: 0 }),
    dispatch: () => {},
    state: {
      selection: { from: 0 },
      tr,
      schema: { nodes: { file: { create: () => ({}) } } },
    },
  } as unknown as EditorView;
}

function pasteEvent(): ClipboardEvent {
  const file = new File(["hi"], "notes.pdf", { type: "application/pdf" });
  const clipboardData = { files: [file], getData: () => "" };
  // SAFETY: `handlePaste` reads only `clipboardData`.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- jsdom has no ClipboardEvent or DataTransfer, so the stub is cast through unknown
  return Object.assign(new Event("paste"), { clipboardData }) as unknown as ClipboardEvent;
}

function setup(labels: Label[] = []) {
  mockCommand("import_file_from_bytes", makeFile({}, { id: "file-9", spaceId: "space-1" }));
  mockCommand("list_labels", labels);
  mockCommand("create_label", makeLabel({ id: "label-new", name: "Pasted" }));
  mockCommand("attach_label", null);
  const { result } = renderHook(() => usePasteFiles("space-1"), { wrapper });
  result.current.handlePaste(fakeView(), pasteEvent());
}

describe("usePasteFiles labels", () => {
  it("creates the Pasted label and puts it on the pasted file", async () => {
    setup();
    await waitFor(() => expect(callsOf("attach_label")).toHaveLength(1));
    expect(callsOf("create_label")[0]).toMatchObject({ spaceId: "space-1", name: "Pasted" });
    expect(callsOf("attach_label")[0]).toMatchObject({ entityId: "file-9", labelId: "label-new" });
  });

  it("reuses an existing Pasted label", async () => {
    setup([makeLabel({ id: "label-old", name: "pasted" })]);
    await waitFor(() => expect(callsOf("attach_label")).toHaveLength(1));
    expect(callsOf("create_label")).toHaveLength(0);
    expect(callsOf("attach_label")[0]).toMatchObject({ labelId: "label-old" });
  });
});
