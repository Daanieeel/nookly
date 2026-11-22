import { describe, expect, it } from "vitest";
import { TERMS_VERSION } from "../../../../packages/shared/src/api/legal";
import { type LegalDoc, type LegalPage, legal } from "./legal";

const PAGES: LegalPage[] = ["imprint", "privacy", "terms"];
const LOCALES = ["de", "en"] as const;

function textOf(doc: LegalDoc): string {
  return [
    doc.title,
    ...doc.sections.flatMap((s) => [s.heading, ...s.body, ...(s.list ?? [])]),
  ].join("\n");
}

describe.each(LOCALES)("legal pages (%s)", (locale) => {
  describe.each(PAGES)("%s", (page) => {
    const doc = legal(locale, page);
    const text = textOf(doc);

    it("holds no sample or placeholder values", () => {
      expect(text).not.toMatch(/Mustermann|Musterstra|Musterstadt|beispiel\.de|123 456789/i);
    });

    it("names the contact email", () => {
      expect(text).toContain("contact@nookly.work");
    });

    it("has no dashes in its copy", () => {
      expect(text).not.toMatch(/[–—]/);
      expect(text).not.toMatch(/ - /);
    });

    it("has a date and no empty section", () => {
      expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.sections.length).toBeGreaterThan(2);
      for (const section of doc.sections) {
        expect(section.heading.trim()).not.toBe("");
        expect(section.body.length + (section.list?.length ?? 0)).toBeGreaterThan(0);
      }
    });
  });

  it("the imprint names the provider and the postal address", () => {
    const text = textOf(legal(locale, "imprint"));
    expect(text).toContain("Daniel Dopatka");
    expect(text).toContain("Sally-Ehrlich-Straße 8");
    expect(text).toContain("96450 Coburg");
    expect(text).toContain("Bayern");
  });

  it("the privacy policy names who is responsible, every service that sees data and the authority", () => {
    const text = textOf(legal(locale, "privacy"));
    expect(text).toContain("Daniel Dopatka");
    for (const name of [
      "Cloudflare",
      "GitHub",
      "Heroku",
      "Scaleway",
      "Resend",
      "Apple",
      "Google",
    ]) {
      expect(text).toContain(name);
    }
    expect(text).toContain("Bayerisches Landesamt für Datenschutzaufsicht");
    expect(text).toMatch(/Art\. 6/);
  });

  it("the privacy policy warns about the US CLOUD Act where it covers transfers abroad", () => {
    const section = legal(locale, "privacy").sections.find((s) =>
      /Drittl\u00e4nder|other countries/.test(s.heading),
    );
    expect(section).toBeDefined();
    const text = [...(section?.body ?? [])].join("\n");
    expect(text).toContain("CLOUD Act");
    // The documents of the Files module are kept in France, so the notice says they are not covered.
    expect(text).toContain("Files");
    expect(text).toContain("Scaleway");
  });

  it("the privacy policy promises no exact reply time for rights requests", () => {
    const text = textOf(legal(locale, "privacy"));
    expect(text).not.toMatch(/innerhalb eines Monats|within a month/);
  });

  it("the privacy policy names 18 as the age for an account", () => {
    const text = textOf(legal(locale, "privacy"));
    expect(text).toContain("18");
    // Art. 16 GDPR is the right to rectification: only an age of 16 is wrong.
    expect(text).not.toMatch(/\b16 (Jahre|years)|ab 16|age of 16/);
  });

  it("the terms keep commercial use of the sync service for those who ask first", () => {
    const section = legal(locale, "terms").sections.find((s) =>
      /^(Der Dienst|The service)$/.test(s.heading),
    );
    const text = [...(section?.body ?? [])].join("\n");
    expect(text).toMatch(locale === "de" ? /gewerblich/ : /commercial/);
    expect(text).toContain("contact@nookly.work");
    // The app and its code stay free to use commercially under the AGPL.
    expect(text).toContain("AGPL");
  });

  it("the privacy policy says plainly that synced content is not end to end encrypted", () => {
    const text = textOf(legal(locale, "privacy")).toLowerCase();
    expect(text).toMatch(
      locale === "de" ? /nicht ende zu ende verschlüsselt/ : /not end to end encrypted/,
    );
  });

  it("the terms name the provider, the minimum age and how to end the agreement", () => {
    const text = textOf(legal(locale, "terms"));
    expect(text).toContain("Daniel Dopatka");
    expect(text).toContain("18");
    // Art. 16 GDPR is the right to rectification: only an age of 16 is wrong.
    expect(text).not.toMatch(/\b16 (Jahre|years)|ab 16|age of 16/);
    expect(text).toContain("30");
    expect(text).toMatch(locale === "de" ? /Haftung/ : /Liability/);
  });
});

describe.each(LOCALES)("what a lawyer's pages have that ours lacked (%s)", (locale) => {
  const heading = (page: LegalPage, de: RegExp, en: RegExp) =>
    legal(locale, page).sections.find((s) => (locale === "de" ? de : en).test(s.heading));

  it("the privacy policy overviews data, people, purposes and legal bases", () => {
    const section = heading(
      "privacy",
      /^Übersicht der Verarbeitungen$/,
      /^Overview of processing$/,
    );
    expect(section?.list).toHaveLength(4);
    expect(section?.list?.join(" ")).toMatch(/Art\. 6 (Abs\. 1 lit\. |\(1\) \()b/);
  });

  it("the privacy policy says what sensitive content means for the person storing it", () => {
    const section = heading("privacy", /^Sensible Inhalte$/, /^Sensitive content$/);
    expect(section).toBeDefined();
    expect(section?.body.join(" ")).toMatch(locale === "de" ? /Gesundheit/ : /health/);
  });

  it("the privacy policy covers local storage, permissions, crash reports, security measures and contact", () => {
    const text = textOf(legal(locale, "privacy"));
    expect(text).toContain("§ 25");
    expect(text).toMatch(locale === "de" ? /Kamera/ : /camera/);
    expect(text).toMatch(locale === "de" ? /Absturzbericht/ : /crash report/);
    expect(text).toContain("TLS");
    expect(text).toContain("argon2id");
    expect(heading("privacy", /^Kontakt mit uns$/, /^Contacting us$/)).toBeDefined();
    expect(text).toMatch(locale === "de" ? /Irland/ : /Ireland/);
    expect(text).toMatch(locale === "de" ? /gesondert/ : /separately/);
  });

  it("the website log fields and where they are kept are named", () => {
    const section = heading("privacy", /^Diese Website$/, /^This website$/);
    expect(section?.body.join(" ")).toMatch(locale === "de" ? /Referrer/ : /referrer/i);
  });

  it("the terms reserve the name, say Nookly is not tied to Moodle, Google or Apple, and say how we reach you", () => {
    expect(heading("terms", /^Name und Marke$/, /^Name and trademark$/)).toBeDefined();
    const third = heading("terms", /^Dienste Dritter$/, /^Third party services$/);
    expect(third?.body.join(" ")).toMatch(locale === "de" ? /nicht verbunden/ : /not affiliated/);
    const talk = heading("terms", /^Kommunikation und Support$/, /^Communication and support$/);
    expect(talk?.body.join(" ")).toMatch(locale === "de" ? /in der App/ : /in the app/);
  });

  it("the imprint has a copyright section", () => {
    expect(heading("imprint", /^Urheberrecht$/, /^Copyright$/)).toBeDefined();
  });
});

describe("both languages", () => {
  it.each(PAGES)("%s has the same sections in German and English", (page) => {
    const de = legal("de", page);
    const en = legal("en", page);
    expect(en.sections.length).toBe(de.sections.length);
    expect(en.updated).toBe(de.updated);
    en.sections.forEach((section, i) => {
      expect(section.body.length).toBe(de.sections[i]?.body.length);
      expect(section.list?.length ?? 0).toBe(de.sections[i]?.list?.length ?? 0);
    });
  });
});

describe("the apps' terms version", () => {
  it("is the date of these terms, so the apps ask again exactly when the terms change", () => {
    expect(TERMS_VERSION).toBe(legal("de", "terms").updated);
  });
});
