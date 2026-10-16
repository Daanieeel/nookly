import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFile } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { MarkdownFileViewer } from "./FileDetailView.tsx";

afterEach(() => vi.unstubAllGlobals());

describe("MarkdownFileViewer", () => {
  it("draws dark by default, like code and raw text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("# Course notes")),
    );
    const file = makeFile({ localPath: "/files/notes.md", originalFilename: "notes.md" });
    const { container } = renderWithProviders(<MarkdownFileViewer file={file} src="asset://x" />);
    await screen.findByRole("heading", { name: "Course notes" });
    expect(container.querySelector(".viewer-dark")).not.toBeNull();
    expect(container.querySelector(".viewer-light")).toBeNull();
  });
});
