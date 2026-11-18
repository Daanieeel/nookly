import { createPage, createSpace, createTask, trashEntity } from "@nookly/shared/data";
import { render, screen } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";
import { ScrollView, Text } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { JotList } from "../screens/PageLists.tsx";
import { TrashScreen } from "../screens/TrashScreen.tsx";
import { FixedTop } from "./fixed-top.tsx";
import { Screen } from "./Screen.tsx";

/// Whether `node` scrolls with the page: it sits inside the page's scroll view.
function scrolls(node: ReactTestInstance): boolean {
  for (let at: ReactTestInstance | null = node; at; at = at.parent) {
    if (at.type === ScrollView && !at.props.horizontal) return true;
  }
  return false;
}

// A list page scrolled away its title, its Filter and Display and its tabs with the list:
// to change a filter far down, one scrolled all the way back up. They stay put now, as the
// desktop's header does, and only the list scrolls.
describe("a list page's top", () => {
  it("stays put over the scrolling page", () => {
    render(
      <Screen>
        <FixedTop>
          <Text>Top</Text>
        </FixedTop>
        <Text>Body</Text>
      </Screen>,
    );
    expect(scrolls(screen.getByText("Top"))).toBe(false);
    expect(scrolls(screen.getByText("Body"))).toBe(true);
  });

  it("is drawn in place where nothing scrolls", () => {
    render(
      <FixedTop>
        <Text>Top</Text>
      </FixedTop>,
    );
    expect(screen.getByText("Top")).toBeTruthy();
  });

  it("keeps Trash's title, Filter and chips put, and scrolls its items", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    await trashEntity(data.db, await createTask(data.db, work, "Old task"));
    const page = await renderScreens({ index: () => <TrashScreen /> }, data);
    const row = await page.findByRole("button", { name: /^Old task/ });
    expect(scrolls(row)).toBe(true);
    expect(scrolls(page.getByRole("button", { name: "Filter" }))).toBe(false);
    expect(scrolls(page.getByRole("header", { name: /^Trash/ }))).toBe(false);
  });

  it("keeps Jots' tabs put", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await createPage(data.db, space, "jot", "An idea");
    const page = await renderScreens(
      {
        index: () => (
          <Screen>
            <JotList spaceId={space} />
          </Screen>
        ),
      },
      data,
    );
    expect(await page.findByRole("button", { name: /^An idea/ })).toBeTruthy();
    expect(scrolls(page.getByRole("tab", { name: /^Unrefined/ }))).toBe(false);
    expect(scrolls(page.getByRole("button", { name: /^An idea/ }))).toBe(true);
  });
});
