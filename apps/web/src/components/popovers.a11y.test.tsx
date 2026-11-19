import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it } from "vitest";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import type { Release } from "@/lib/releases";
import { expectNoA11yViolations } from "@/test/axe";
import { DownloadButton } from "./download-button";
import { LanguageSwitch } from "./language-switch";
import { ThemeSwitch } from "./theme-switch";

const RELEASE: Release = {
  version: "0.75.3",
  publishedAt: "2026-11-17T10:00:00Z",
  url: "https://github.com/Daanieeel/nookly/releases/tag/v0.75.3",
  downloads: [
    {
      id: "mac-arm",
      os: "macos",
      file: "Nookly_0.75.3_aarch64.dmg",
      url: "https://example.com/a.dmg",
      size: 27_000_000,
    },
    {
      id: "windows-exe",
      os: "windows",
      file: "Nookly_0.75.3_x64-setup.exe",
      url: "https://example.com/a.exe",
      size: 19_000_000,
    },
    {
      id: "linux-deb",
      os: "linux",
      file: "Nookly_0.75.3_amd64.deb",
      url: "https://example.com/a.deb",
      size: 26_000_000,
    },
  ],
  checksums: null,
};

// Each popover is opened the way a visitor opens it, then checked with axe.
describe("the site's popovers have no axe violations", () => {
  it("the download menu", async () => {
    render(
      <TooltipProvider>
        <DownloadButton locale="en" release={RELEASE} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More downloads" }));
    await screen.findByRole("link", { name: /All downloads/ });
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
