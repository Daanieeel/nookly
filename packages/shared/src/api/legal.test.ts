import { describe, expect, it } from "vitest";
import { TERMS_VERSION, legalUrl, requiresTerms } from "./legal.ts";

describe("legal links", () => {
  it("points at the website's English pages", () => {
    expect(legalUrl("terms", "en-US")).toBe("https://nookly.work/terms");
    expect(legalUrl("privacy", "en")).toBe("https://nookly.work/privacy");
    expect(legalUrl("imprint", "en-GB")).toBe("https://nookly.work/imprint");
    expect(legalUrl("license", "en")).toBe("https://nookly.work/license");
  });

  it("points a German device at the German pages, the binding ones", () => {
    expect(legalUrl("terms", "de-DE")).toBe("https://nookly.work/de/agb");
    expect(legalUrl("privacy", "de")).toBe("https://nookly.work/de/datenschutz");
    expect(legalUrl("imprint", "de-AT")).toBe("https://nookly.work/de/impressum");
    expect(legalUrl("license", "de")).toBe("https://nookly.work/de/lizenz");
  });

  it("falls back to English for any other language", () => {
    expect(legalUrl("terms", "fr-FR")).toBe("https://nookly.work/terms");
    expect(legalUrl("terms", "")).toBe("https://nookly.work/terms");
  });
});

describe("the terms version", () => {
  it("is the date of the terms, so a change to the terms is a new version", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("applies to Nookly's own server only, not to one someone runs themselves", () => {
    expect(requiresTerms("https://sync.nookly.work")).toBe(true);
    expect(requiresTerms("https://sync.nookly.work/")).toBe(true);
    expect(requiresTerms("https://sync.example.com")).toBe(false);
    expect(requiresTerms("http://localhost:3000")).toBe(false);
  });
});
