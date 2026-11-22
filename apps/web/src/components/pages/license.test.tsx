import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { LicenseArticle } from "./license";

describe("LicenseArticle", () => {
  it("opens with the license in short: what you may do, what not, and what you owe", () => {
    render(<LicenseArticle locale="en" />);
    expect(screen.getByRole("heading", { level: 1, name: "License" })).toBeTruthy();
    for (const [group, item] of [
      ["Permissions", "Commercial use"],
      ["Limitations", "Warranty"],
      ["Conditions", "Disclose source"],
    ] as const) {
      const section = screen.getByRole("heading", { name: group }).parentElement;
      expect(section).not.toBeNull();
      if (section) expect(within(section).getByText(item)).toBeTruthy();
    }
  });

  it("shows the full license as headings and paragraphs, not one block of preformatted text", () => {
    const { container } = render(<LicenseArticle locale="en" />);
    expect(
      screen.getByRole("heading", { level: 2, name: "GNU AFFERO GENERAL PUBLIC LICENSE" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Preamble" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: "0. Definitions." })).toBeTruthy();
    expect(screen.getByText(/Version 3, 19 November 2007/)).toBeTruthy();
    expect(container.querySelector("pre")).not.toBeNull();
    expect(container.querySelectorAll("pre")).toHaveLength(1);
  });

  it("links the web addresses in the license text", () => {
    render(<LicenseArticle locale="en" />);
    const link = screen.getAllByRole("link", { name: "https://fsf.org/" })[0];
    expect(link?.getAttribute("href")).toBe("https://fsf.org/");
  });

  it("says it is not legal advice, and points to gnu.org", () => {
    render(<LicenseArticle locale="en" />);
    expect(screen.getByText(/not legal advice/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Learn more at gnu.org" }).getAttribute("href")).toBe(
      "https://www.gnu.org/licenses/agpl-3.0.html",
    );
  });

  it("leads the card with who is licensed under what", () => {
    render(<LicenseArticle locale="en" />);
    expect(screen.getByText("Nookly is licensed under the")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "GNU Affero General Public License v3.0" }),
    ).toBeTruthy();
  });

  it("has a contents menu that jumps to the license's parts", async () => {
    const user = userEvent.setup();
    render(<LicenseArticle locale="en" />);
    const button = screen.getByRole("button", { name: "Contents" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await user.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const jump = screen.getByRole("link", { name: "Preamble" });
    expect(jump.getAttribute("href")).toBe("#preamble");
    expect(document.getElementById("preamble")).not.toBeNull();
    await user.click(jump);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("tells German readers that only the English text binds", () => {
    render(<LicenseArticle locale="de" />);
    expect(screen.getByRole("heading", { level: 1, name: "Lizenz" })).toBeTruthy();
    expect(screen.getByText(/englische Originaltext/)).toBeTruthy();
  });

  it.each(["en", "de"] as const)("has no accessibility violations (%s)", async (locale) => {
    const { container } = render(<LicenseArticle locale={locale} />);
    await expectNoA11yViolations(container);
  });
});
