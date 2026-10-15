import { renderScreens } from "../test/render.tsx";
import { WhatsNewScreen, plain } from "./WhatsNewScreen.tsx";

describe("what's new", () => {
  it("lists the newest release first with its headline and highlights", async () => {
    const screen = await renderScreens({ index: () => <WhatsNewScreen /> });
    const headings = await screen.findAllByRole("header");
    expect(headings.length).toBeGreaterThan(1);
    expect(screen.getByText("One account for every device")).toBeTruthy();
    expect(screen.getByText("Sign in from the titlebar")).toBeTruthy();
  });

  it("reads markdown as plain text", () => {
    expect(plain("Press `Mod+K` for **search**")).toBe("Press Mod+K for search");
  });
});
