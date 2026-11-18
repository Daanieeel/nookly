import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MOODLE_MARK } from "./moodle-mark.ts";

// The phone draws the desktop's own file (`packages/ui/src/assets/moodle.svg`), never a copy
// that drifts from it.
it("is the desktop's Moodle mark", () => {
  const desktop = readFileSync(
    join(__dirname, "../../../../packages/ui/src/assets/moodle.svg"),
    "utf8",
  );
  expect(MOODLE_MARK.trim()).toBe(desktop.trim());
});
