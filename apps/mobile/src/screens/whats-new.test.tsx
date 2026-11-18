import { parseWhatsNew } from "@nookly/shared/whats-new";
import { renderScreens } from "../test/render.tsx";
import { WhatsNewScreen, plain } from "./WhatsNewScreen.tsx";

describe("what's new", () => {
  it("lists the newest release first with its headline and highlights", async () => {
    const screen = await renderScreens({ index: () => <WhatsNewScreen /> });
    const headings = await screen.findAllByRole("header");
    expect(headings.length).toBeGreaterThan(1);
    // The newest release in `whats-new.json`, whatever it says.
    const [newest] = parseWhatsNew();
    expect(screen.getByText(newest.title ?? newest.version)).toBeTruthy();
    expect(screen.getByText(newest.highlights[0].title)).toBeTruthy();
  });

  it("reads markdown as plain text", () => {
    expect(plain("Press `Mod+K` for **search**")).toBe("Press Mod+K for search");
  });
});
