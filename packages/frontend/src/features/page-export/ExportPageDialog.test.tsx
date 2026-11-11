import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeBlock, makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { loadOptions } from "./export-options.ts";
import { renderDocument } from "./export-page.ts";
import { type ExportRenderer, ExportPageDialog } from "./ExportPageDialog.tsx";

/// Stands in for the PDF writer and pdf.js, which need fonts and a canvas from a real
/// browser. The other formats are written for real.
const renderer: ExportRenderer = {
  render: async (doc, format, options) =>
    format === "pdf" ? new Uint8Array([37, 80, 68, 70]) : renderDocument(doc, format, options),
  Preview: ({ bytes }) => <div>PDF preview of {bytes.length} bytes</div>,
};

const note = makeEntity({ id: "note-1", type: "note", title: "Physics: week 3" });

function setup() {
  mockCommand("list_blocks", [makeBlock({ blockType: "paragraph", content: "Waves" })]);
  mockCommand("render_page_markdown", "# Physics\n\nWaves");
  const onOpenChange = vi.fn();
  const view = renderWithProviders(
    <ExportPageDialog entity={note} open onOpenChange={onOpenChange} renderer={renderer} />,
  );
  return { ...view, onOpenChange };
}

describe("ExportPageDialog", () => {
  it("previews the page as it will print", async () => {
    setup();
    expect(await screen.findByText("PDF preview of 4 bytes")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /PDF/ })).toHaveAttribute("aria-checked", "true");
  });

  it("saves a Word file where the user picks and closes", async () => {
    mockCommand("plugin:dialog|save", "/tmp/Physics week 3");
    mockCommand("write_page_export", null);
    const { user, onOpenChange } = setup();
    await user.click(screen.getByRole("radio", { name: /Word/ }));
    await user.click(screen.getByRole("button", { name: "Export Word" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(callsOf("plugin:dialog|save")[0]).toMatchObject({
      options: {
        defaultPath: "Physics week 3.docx",
        filters: [{ name: "Word document", extensions: ["docx"] }],
      },
    });
    const [bytes] = callsOf("write_page_export");
    // A Word file is a zip.
    if (!(bytes instanceof Uint8Array)) throw new Error("the file was not sent as bytes");
    expect(Array.from(bytes.slice(0, 2))).toEqual([80, 75]);
  });

  it("writes nothing and stays open when the save dialog is cancelled", async () => {
    mockCommand("plugin:dialog|save", null);
    mockCommand("write_page_export", null);
    const { user, onOpenChange } = setup();
    await user.click(screen.getByRole("button", { name: "Export PDF" }));
    await waitFor(() => expect(callsOf("plugin:dialog|save")).toHaveLength(1));
    expect(callsOf("write_page_export")).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Export PDF" })).toBeEnabled();
  });

  it("keeps the dialog open with the error on the button when writing fails", async () => {
    mockCommand("plugin:dialog|save", "/tmp/Physics.pdf");
    mockCommandWith("write_page_export", () => {
      throw new Error("disk full");
    });
    const { user, onOpenChange } = setup();
    await user.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(
      await screen.findByRole("button", { name: /Couldn't export, try again/ }),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("saves Markdown through the page's markdown export", async () => {
    mockCommand("plugin:dialog|save", "/tmp/Physics.md");
    mockCommand("export_page_markdown", null);
    const { user, onOpenChange } = setup();
    await user.click(screen.getByRole("radio", { name: /Markdown/ }));
    expect(await screen.findByText(/# Physics/)).toBeInTheDocument();
    // Page options belong to the document formats.
    expect(screen.queryByLabelText("Include the title as a heading")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Export Markdown" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(callsOf("export_page_markdown")[0]).toMatchObject({
      entityId: "note-1",
      path: "/tmp/Physics.md",
    });
  });

  it("remembers the options for the next export", async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText("Include the title as a heading"));
    await user.click(screen.getByRole("radio", { name: /Landscape/ }));
    await user.click(screen.getByRole("radio", { name: /OpenDocument/ }));
    expect(loadOptions()).toMatchObject({ includeTitle: false, landscape: true, format: "odt" });
  });
});
