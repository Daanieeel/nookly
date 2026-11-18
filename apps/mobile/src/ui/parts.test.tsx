import { Text } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { DetailsPart, MainPart, PartProvider } from "./parts.tsx";

const Item = () => (
  <>
    <MainPart>
      <Text>the page</Text>
    </MainPart>
    <DetailsPart>
      <Text>the properties</Text>
    </DetailsPart>
  </>
);

describe("the two parts of an item", () => {
  it("show the main content in the page and the properties in the details", async () => {
    const page = await renderScreens(
      {
        index: () => (
          <PartProvider value="main">
            <Item />
          </PartProvider>
        ),
      },
      testData(),
    );
    expect(await page.findByText("the page")).toBeTruthy();
    expect(page.queryByText("the properties")).toBeNull();
    page.unmount();
    const details = await renderScreens(
      {
        index: () => (
          <PartProvider value="details">
            <Item />
          </PartProvider>
        ),
      },
      testData(),
    );
    expect(await details.findByText("the properties")).toBeTruthy();
    expect(details.queryByText("the page")).toBeNull();
  });

  it("show both where nothing says which", async () => {
    const screen = await renderScreens({ index: () => <Item /> }, testData());
    expect(await screen.findByText("the page")).toBeTruthy();
    expect(screen.getByText("the properties")).toBeTruthy();
  });
});
