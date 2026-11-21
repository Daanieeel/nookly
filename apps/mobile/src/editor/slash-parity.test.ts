import { readFileSync } from "node:fs";
import { SLASH_ITEMS } from "./commands.ts";
import { SLASH_ICON_PATHS } from "./slash-icons.ts";

// The phone's block menu is the desktop's: every block, in the desktop's words, groups and
// order. This reads the desktop's own list, so a block added there fails here until the phone
// has it too.
const desktop = readFileSync(
  new URL(
    "../../../../packages/frontend/src/features/notes/slash-command-extension.tsx",
    import.meta.url,
  ),
  "utf8",
);

function desktopItems() {
  const list = desktop.slice(
    desktop.indexOf("export const SLASH_ITEMS"),
    desktop.indexOf("/// Turns the block"),
  );
  return list
    .split(/\n {2}\{\n {4}title: /)
    .slice(1)
    .map((chunk) => {
      const field = (name: string) => new RegExp(`${name}: "([^"]*)"`).exec(chunk)?.[1] ?? "";
      return {
        label: /^"([^"]*)"/.exec(chunk)?.[1] ?? "",
        group: field("group"),
        description: field("description"),
      };
    });
}

describe("the block menu against the desktop's", () => {
  it("has every block, in the same order, groups and words", () => {
    expect(
      SLASH_ITEMS.map(({ label, group, description }) => ({ label, group, description })),
    ).toEqual(desktopItems());
  });

  it("draws a mark for every block", () => {
    for (const item of SLASH_ITEMS) expect(SLASH_ICON_PATHS.get(item.id)).toBeTruthy();
  });
});
