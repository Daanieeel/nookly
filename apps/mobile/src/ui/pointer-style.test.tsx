import { PointerStyle } from "../../modules/nookly-window/src/PointerStyle.tsx";
import { SplitDivider } from "../shell/SplitDivider.tsx";
import { renderScreens, testData } from "../test/render.tsx";
import { IconButton } from "./Button.tsx";

// With a trackpad or mouse, iPadOS's own controls change the pointer over them: a round
// button lifts or lights up, a divider shows arrows to either side (D100).
describe("the pointer over a tablet's controls", () => {
  it("takes the system's button effect over a round button", async () => {
    const screen = await renderScreens(
      { index: () => <IconButton label="Go Back" icon={null} onPress={() => {}} /> },
      testData(),
      "/",
      { width: 1194 },
    );
    await screen.findByRole("button", { name: "Go Back" });
    expect(screen.UNSAFE_getByType(PointerStyle).props.effect).toBe("button");
  });

  it("shows arrows to either side over the split divider", async () => {
    const screen = await renderScreens(
      { index: () => <SplitDivider left={500} area={1000} /> },
      testData(),
      "/",
      { width: 1194 },
    );
    await screen.findByLabelText("Split Divider");
    expect(screen.UNSAFE_getByType(PointerStyle).props.effect).toBe("resize");
  });

  it("leaves a phone's buttons as they are", async () => {
    const screen = await renderScreens(
      { index: () => <IconButton label="Go Back" icon={null} onPress={() => {}} /> },
      testData(),
    );
    await screen.findByRole("button", { name: "Go Back" });
    expect(screen.UNSAFE_queryByType(PointerStyle)).toBeNull();
  });
});
