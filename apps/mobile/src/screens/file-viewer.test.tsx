import { addFile, addFileLink, createSpace, getFile } from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { View } from "react-native";
import type { FileViewer } from "../ui/file-viewer.tsx";
import { barLabels, pressBarButton, renderScreens, testData } from "../test/render.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { viewerFor } from "./file-kinds.ts";
import { FileViewerScreen } from "./FileViewer.tsx";

// This build's own viewer, standing in for the native one (PDFKit, Quick Look): what it was
// asked to show.
const standIn: FileViewer = {
  available: true,
  View: (props) => (
    <View accessibilityLabel={props.accessibilityLabel} testID={`viewer ${props.query ?? ""}`} />
  ),
  thumbnail: async () => null,
};

async function oneFile(name: string, path = `file:///docs/files/aaa-${name}`) {
  const data = testData();
  const space = await createSpace(data.db, "Uni", "#3b82f6");
  const id = await addFile(data.db, space, name, path);
  return { data, space, id };
}

describe("which viewer a file opens in", () => {
  it("shows text and code as text, and everything else as the system shows it", async () => {
    const { data, space } = await oneFile("notes.pdf");
    const kinds = await Promise.all(
      [
        "notes.pdf",
        "essay.docx",
        "budget.xlsx",
        "photo.heic",
        "talk.mp4",
        "main.ts",
        "read.md",
      ].map(async (name) =>
        viewerFor(
          (await getFile(data.db, await addFile(data.db, space, name, `file:///x/${name}`)))!,
        ),
      ),
    );
    expect(kinds).toEqual(["pdf", "system", "system", "system", "system", "text", "text"]);
  });

  it("has nothing to show for a link or a file still on its way", async () => {
    const { data, space, id } = await oneFile("slides.pptx");
    data.driver.rows("UPDATE files SET local_path = NULL, blob = 'abc' WHERE entity_id = ?", id);
    expect(viewerFor((await getFile(data.db, id))!)).toBe("none");
    const link = await addFileLink(data.db, space, "https://www.dropbox.com/s/abc/Report.pdf?dl=0");
    expect(viewerFor((await getFile(data.db, link))!)).toBe("none");
  });
});

describe("the file viewer", () => {
  it("opens from the file's page", async () => {
    const { data, id } = await oneFile("notes.pdf");
    const screen = await renderScreens(
      {
        "entity/[id]": () => <EntityScreen id={id} />,
        "file/[id]": () => <FileViewerScreen id={id} />,
      },
      data,
      `/entity/${id}`,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "View notes.pdf" }));
    expect(screen.getPathname()).toBe(`/file/${id}`);
  });

  it("offers sharing in the bar, and search for a PDF", async () => {
    const { data, id } = await oneFile("notes.pdf");
    const screen = await renderScreens(
      { "file/[id]": () => <FileViewerScreen id={id} /> },
      data,
      `/file/${id}`,
      { fileViewer: standIn },
    );
    await screen.findByLabelText("notes.pdf");
    expect(barLabels(screen)).toEqual(expect.arrayContaining(["Search", "Share"]));
  });

  it("shows Office documents and the rest as the system does", async () => {
    const { data, id } = await oneFile("essay.docx");
    const screen = await renderScreens(
      { "file/[id]": () => <FileViewerScreen id={id} /> },
      data,
      `/file/${id}`,
      { fileViewer: standIn },
    );
    expect(await screen.findByLabelText("essay.docx")).toBeTruthy();
    expect(barLabels(screen)).toContain("Share");
    expect(barLabels(screen)).not.toContain("Search");
  });

  it("searches a PDF from the bar", async () => {
    const { data, id } = await oneFile("notes.pdf");
    const screen = await renderScreens(
      { "file/[id]": () => <FileViewerScreen id={id} /> },
      data,
      `/file/${id}`,
      { fileViewer: standIn },
    );
    await pressBarButton(screen, "Search");
    await fireEvent.changeText(await screen.findByLabelText("Search the PDF"), "lemma");
    expect(await screen.findByTestId("viewer lemma")).toBeTruthy();
  });

  it("offers the file to other apps where this build cannot show it", async () => {
    const { data, id } = await oneFile("essay.docx");
    const screen = await renderScreens(
      { "file/[id]": () => <FileViewerScreen id={id} /> },
      data,
      `/file/${id}`,
      { fileViewer: { ...standIn, available: false } },
    );
    expect(await screen.findByRole("button", { name: "Open In…" })).toBeTruthy();
    expect(barLabels(screen)).toContain("Share");
    expect(barLabels(screen)).not.toContain("Search");
  });
});
