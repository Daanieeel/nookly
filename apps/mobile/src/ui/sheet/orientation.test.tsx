import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen } from "@testing-library/react-native";
import { Modal, Text } from "react-native";
import { Sheet } from "./Sheet.tsx";

/// Every source file under `dir`, tests left out.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const root = join(__dirname, "..", "..");

// React Native's `Modal` allows only portrait on iOS unless told otherwise, so every
// popover, menu and dialog turned an iPad held in landscape to portrait as it opened.
describe("a window over the app", () => {
  it("lets the iPad stay in the orientation it is held in", async () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Status">
        <Text>Backlog</Text>
      </Sheet>,
    );
    await screen.findByText("Backlog");
    expect(screen.UNSAFE_getByType(Modal).props.supportedOrientations).toEqual(
      expect.arrayContaining([
        "portrait",
        "portrait-upside-down",
        "landscape-left",
        "landscape-right",
      ]),
    );
  });

  it("names the orientations on every Modal in the app", () => {
    const bare = sources(root).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [...text.matchAll(/<Modal\b[^>]*>/g)]
        .filter((tag) => !tag[0].includes("supportedOrientations"))
        .map(() => relative(root, file));
    });
    expect(bare).toEqual([]);
  });
});
