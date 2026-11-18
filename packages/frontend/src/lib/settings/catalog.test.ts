import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { settingsCatalog } from "./catalog.ts";

// Tests run from this package's folder.
const FILE = resolve(process.cwd(), "../../apps/desktop/src-tauri/src/cli/settings-catalog.json");

// `nookly cli settings` reads the catalog checked in beside it. A setting added, renamed or
// given a new schema here without it would be unknown to the CLI, or checked wrongly.
// Regenerate with `NOOKLY_UPDATE_SNAPSHOTS=1 bun run test catalog`, then format the file.
describe("the settings catalog", () => {
  it("matches the registry", () => {
    const fresh = settingsCatalog();
    if (process.env.NOOKLY_UPDATE_SNAPSHOTS === "1") {
      writeFileSync(FILE, `${JSON.stringify(fresh, null, 2)}\n`);
    }
    // Compared as data: the formatter decides how the file is laid out.
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(fresh);
  });

  it("describes every value a setting takes", () => {
    const theme = settingsCatalog().find((entry) => entry.id === "appearance.theme");
    expect(theme?.schema).toMatchObject({ enum: expect.arrayContaining(["light", "dark"]) });
  });
});
