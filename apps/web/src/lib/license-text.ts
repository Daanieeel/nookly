import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/// The full license, read from the repository's own `LICENSE` at build time, so the page
/// can never differ from the file the code is licensed under. The site is built from
/// `apps/web`, one folder below the repository root's `apps`.
export function licenseText(): string {
  return readFileSync(resolve(process.cwd(), "../../LICENSE"), "utf-8");
}

export type LicenseBlock = {
  kind: "title" | "version" | "h3" | "h4" | "p" | "item" | "code";
  text: string;
};

const SECTION = /^\s*\d+\. .+\.$/;
const OPTION = /^\s{4}[a-z]\) /;

/// The license file as blocks to draw: the title and version, headings, paragraphs with the
/// file's hard wrapped lines joined, the lettered options, and the notice template kept as
/// code. Every word of the file ends up in one block.
export function licenseBlocks(text: string): LicenseBlock[] {
  const blocks: LicenseBlock[] = [];
  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((line) => line.trim() !== "");
    const first = lines[0];
    if (first === undefined) continue;
    const joined = lines.map((line) => line.trim()).join(" ");
    if (lines.every((line) => /^\s{10,}\S/.test(line))) {
      // Centered lines: the title and version, and the headings, each a block of its own.
      for (const line of lines) {
        const label = line.trim();
        const kind = blocks.length === 0 ? "title" : label.startsWith("Version") ? "version" : "h3";
        blocks.push({ kind, text: label });
      }
    } else if (lines.length === 1 && SECTION.test(first) && first.length < 90) {
      blocks.push({ kind: "h4", text: joined });
    } else if (OPTION.test(first)) {
      blocks.push({ kind: "item", text: joined });
    } else if (/^\s{4}\S/.test(first)) {
      const last = blocks.at(-1);
      const indent = Math.min(...lines.map((line) => line.length - line.trimStart().length));
      const code = lines.map((line) => line.slice(indent)).join("\n");
      if (last?.kind === "code") last.text += `\n\n${code}`;
      else blocks.push({ kind: "code", text: code });
    } else {
      blocks.push({ kind: "p", text: joined });
    }
  }
  return blocks;
}
