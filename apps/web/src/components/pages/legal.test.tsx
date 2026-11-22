import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { LegalArticle } from "./legal";

describe("LegalArticle", () => {
  it("shows the page without a placeholder warning", () => {
    render(<LegalArticle locale="en" page="imprint" />);
    expect(screen.getByRole("heading", { level: 1, name: "Imprint" })).toBeTruthy();
    expect(screen.queryByText(/sample text|placeholder/i)).toBeNull();
  });

  it("turns the contact email into a mail link", () => {
    render(<LegalArticle locale="de" page="imprint" />);
    const link = screen.getByRole("link", { name: "contact@nookly.work" });
    expect(link.getAttribute("href")).toBe("mailto:contact@nookly.work");
  });

  it.each(["en", "de"] as const)("links the source code to GitHub (%s)", (locale) => {
    render(<LegalArticle locale={locale} page="imprint" />);
    const link = screen.getByRole("link", { name: "github.com/Daanieeel/nookly" });
    expect(link.getAttribute("href")).toBe("https://github.com/Daanieeel/nookly");
  });

  it.each([
    ["en", "/license"],
    ["de", "/de/lizenz"],
  ] as const)("links the license from the terms (%s)", (locale, href) => {
    render(<LegalArticle locale={locale} page="terms" />);
    const link = screen.getByRole("link", { name: /GNU Affero General Public License/ });
    expect(link.getAttribute("href")).toBe(href);
  });

  it("links the supervisory authority's website", () => {
    render(<LegalArticle locale="de" page="privacy" />);
    const link = screen.getByRole("link", { name: "www.lda.bayern.de" });
    expect(link.getAttribute("href")).toBe("https://www.lda.bayern.de");
  });

  it("renders a section's list as a list", () => {
    render(<LegalArticle locale="en" page="privacy" />);
    const section = screen
      .getByRole("heading", { name: "The app without an account" })
      .closest("section");
    expect(section).not.toBeNull();
    if (section) expect(within(section).getAllByRole("listitem").length).toBeGreaterThan(3);
  });

  it("points the English pages to the binding German version, and not the German ones", () => {
    const { unmount } = render(<LegalArticle locale="en" page="terms" />);
    expect(screen.getByRole("link", { name: /German version/i }).getAttribute("href")).toBe(
      "/de/agb",
    );
    unmount();
    render(<LegalArticle locale="de" page="terms" />);
    expect(screen.queryByRole("link", { name: /Fassung/i })).toBeNull();
  });

  it.each(["imprint", "privacy", "terms"] as const)(
    "%s has no accessibility violations",
    async (page) => {
      const { container } = render(<LegalArticle locale="en" page={page} />);
      await expectNoA11yViolations(container);
    },
  );
});
