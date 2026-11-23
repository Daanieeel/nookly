import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, it, vi } from "vitest";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { expectNoA11yViolations } from "@/test/axe";
import { DownloadButton } from "./download-button";
import { LanguageSwitch } from "./language-switch";
import { ThemeSwitch } from "./theme-switch";

const asset = (name: string, size: number) => ({
  name,
  size,
  browser_download_url: `https://example.com/${name}`,
});

// What GitHub answers for the latest release; the menu reads it in the browser.
const GITHUB_ANSWER = {
  tag_name: "v1.0.0",
  published_at: "2026-11-23T10:00:00Z",
  html_url: "https://github.com/Daanieeel/nookly/releases/tag/v1.0.0",
  assets: [
    asset("Nookly_1.0.0_aarch64.dmg", 27_000_000),
    asset("Nookly_1.0.0_x64-setup.exe", 19_000_000),
    asset("Nookly_1.0.0_amd64.deb", 26_000_000),
  ],
};

// Each popover is opened the way a visitor opens it, then checked with axe.
describe("the site's popovers have no axe violations", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(GITHUB_ANSWER)),
    );
  });

  it("the download menu", async () => {
    render(
      <TooltipProvider>
        <DownloadButton locale="en" />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More downloads" }));
    await screen.findByRole("link", { name: /All downloads/ });
    await screen.findByText("Version 1.0.0");
    await expectNoA11yViolations();
  });

  it("the language menu", async () => {
    render(
      <TooltipProvider>
        <LanguageSwitch locale="de" page="download" />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("English");
    await expectNoA11yViolations();
  });

  it("the theme menu", async () => {
    render(
      <TooltipProvider>
        <ThemeSwitch locale="en" />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("System");
    await expectNoA11yViolations();
  });
});
