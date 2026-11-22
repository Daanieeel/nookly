import { fireEvent } from "expo-router/testing-library";
import { Linking } from "react-native";
import { renderScreens, testData } from "../../test/render.tsx";
import { LegalPage } from "./LegalPage.tsx";

describe("the Legal page", () => {
  it("lists the four legal pages and opens each on nookly.work", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const screen = await renderScreens({ index: () => <LegalPage /> }, testData());
    for (const [title, path] of [
      ["Terms of Service", /\/(de\/agb|terms)$/],
      ["Privacy Policy", /\/(de\/datenschutz|privacy)$/],
      ["Imprint", /\/(de\/impressum|imprint)$/],
      ["License", /\/(de\/lizenz|license)$/],
    ] as const) {
      await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${title}`) }));
      expect(open).toHaveBeenLastCalledWith(expect.stringMatching(path));
      expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/^https:\/\/nookly\.work\//));
    }
    expect(open).toHaveBeenCalledTimes(4);
  });
});
