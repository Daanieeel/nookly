import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LanguageLink } from "./language-switch";

describe("LanguageLink", () => {
  it("links to the same page in the other language, with that language's flag", () => {
    render(<LanguageLink locale="en" page="download" />);
    const link = screen.getByRole("link", { name: "Deutsch" });
    expect(link.getAttribute("href")).toBe("/de/download");
    expect(link.getAttribute("hreflang")).toBe("de");
    expect(link.querySelector("img")?.getAttribute("src")).toBe("/flags/s/DE.svg");
  });

  it("goes the other way from German, with the US flag for English", () => {
    render(<LanguageLink locale="de" page="home" />);
    const link = screen.getByRole("link", { name: "English" });
    expect(link.getAttribute("hreflang")).toBe("en");
    expect(link.querySelector("img")?.getAttribute("src")).toBe("/flags/s/US.svg");
  });
});
