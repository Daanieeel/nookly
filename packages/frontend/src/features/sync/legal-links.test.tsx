import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { LegalLinks } from "./legal-links.tsx";

beforeEach(() => mockCommand("plugin:opener|open_url", null));

describe("the legal links", () => {
  it("open the website's pages in the browser, in the device's language", async () => {
    const { user } = renderWithProviders(<LegalLinks />);
    await user.click(screen.getByRole("link", { name: "Terms of Service" }));
    await user.click(screen.getByRole("link", { name: "Privacy Policy" }));
    await user.click(screen.getByRole("link", { name: "Imprint" }));
    const opened = callsOf("plugin:opener|open_url").map((args) =>
      args && "url" in args ? String(args.url) : "",
    );
    expect(opened).toEqual([
      expect.stringMatching(/^https:\/\/nookly\.work\/(de\/agb|terms)$/),
      expect.stringMatching(/^https:\/\/nookly\.work\/(de\/datenschutz|privacy)$/),
      expect.stringMatching(/^https:\/\/nookly\.work\/(de\/impressum|imprint)$/),
    ]);
  });

  it("are links, with no accessibility violations", async () => {
    renderWithProviders(<LegalLinks />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    await expectNoA11yViolations();
  });
});
