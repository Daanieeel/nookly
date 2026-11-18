import { ICON_LIBRARY_NAMES } from "@nookly/shared/icons";
import { expect, it } from "vitest";
import { ICON_LIBRARY } from "./entity-icon.tsx";

it("draws exactly the icons the shared list names, in its order", () => {
  expect([...ICON_LIBRARY.keys()]).toEqual([...ICON_LIBRARY_NAMES]);
});
