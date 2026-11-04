import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFile } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { FileViewer } from "./FileDetailView.tsx";

afterEach(() => vi.unstubAllGlobals());

function showFile(fileName: string, text: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(text)),
  );
  const file = makeFile({ localPath: `/files/${fileName}`, originalFilename: fileName });
  return renderWithProviders(<FileViewer file={file} />);
}

describe("copying the content of a text file", () => {
  it.each([
    ["Main.java", "public class Main {}"],
    ["notes.txt", "plain words"],
    ["notes.md", "# Course notes"],
  ])("copies %s from a button at the top of the viewer", async (fileName, text) => {
    const { user } = showFile(fileName, text);
    const button = await screen.findByRole("button", { name: "Copy content" });
    const copied = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(button);
    expect(copied).toHaveBeenCalledWith(text);
  });

  it("offers no copy button for a picture", () => {
    showFile("photo.png", "");
    expect(screen.queryByRole("button", { name: "Copy content" })).toBeNull();
  });
});
