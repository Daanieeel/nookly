import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { MarkdownViewer } from "./MarkdownViewer.tsx";

const SOURCE = [
  "# Course notes",
  "",
  "Some **bold** text and a [link](https://example.com).",
  "",
  "- first",
  "- second",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```ts",
  "const x = 1;",
  "```",
].join("\n");

describe("MarkdownViewer", () => {
  it("renders markdown the way the note editor does", async () => {
    const { container } = renderWithProviders(<MarkdownViewer text={SOURCE} spaceId="s1" />);
    expect(await screen.findByRole("heading", { name: "Course notes" })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("a")).toHaveAttribute("href", "https://example.com");
    await waitFor(() => expect(container.textContent).toContain("const x = 1;"));
  });

  it("is read only", async () => {
    const { container } = renderWithProviders(<MarkdownViewer text={SOURCE} spaceId="s1" />);
    await screen.findByRole("heading", { name: "Course notes" });
    expect(container.querySelector(".tiptap-content")).toHaveAttribute("contenteditable", "false");
  });
});
