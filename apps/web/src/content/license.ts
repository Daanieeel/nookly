import type { Locale } from "@/lib/i18n";

/// The license page: a short summary of the AGPL above its full text. Not legal advice, and
/// it says so. The full text comes from the repository's `LICENSE` (`lib/license-text.ts`).

export type LicenseDoc = {
  title: string;
  intro: string;
  name: string;
  summary: string;
  groups: { heading: string; items: string[] }[];
  /// Said above the license's name, in the card: "Nookly is licensed under the".
  licensedUnder: string;
  disclaimer: string;
  learnMore: string;
  /// Said above the full text where it is not in the reader's language.
  fullNote: string | null;
  contents: string;
};

/// The id of a heading in the full text, for the contents menu to jump to.
export function licenseAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const AGPL_URL = "https://www.gnu.org/licenses/agpl-3.0.html";

const de = {
  title: "Lizenz",
  intro: "Nookly ist freie Software und steht unter der GNU Affero General Public License v3.0.",
  name: "GNU Affero General Public License v3.0",
  summary:
    "Die stärkste Copyleft Lizenz der GNU Familie, gemacht für Software, die auf einem Server läuft. Du darfst Nookly nutzen, ändern und weitergeben, auch kommerziell, solange du allen, an die du es weitergibst, dieselben Freiheiten lässt: Der Quellcode bleibt unter derselben Lizenz offen, die Hinweise bleiben erhalten, und wer eine geänderte Version als Dienst für andere betreibt, stellt ihnen deren Quellcode bereit. Dazu gehört eine Patentlizenz. Eine Gewährleistung gibt es nicht.",
  groups: [
    {
      heading: "Erlaubnisse",
      items: ["Kommerzielle Nutzung", "Änderung", "Weitergabe", "Patentnutzung", "Private Nutzung"],
    },
    { heading: "Einschränkungen", items: ["Haftung", "Gewährleistung"] },
    {
      heading: "Bedingungen",
      items: [
        "Lizenz und Urheberrechtshinweis",
        "Änderungen kenntlich machen",
        "Quellcode offenlegen",
        "Netzwerknutzung gilt als Weitergabe",
        "Gleiche Lizenz",
      ],
    },
  ],
  licensedUnder: "Nookly steht unter der",
  disclaimer: "Das ist eine Zusammenfassung und keine Rechtsberatung.",
  learnMore: "Mehr dazu auf gnu.org",
  fullNote:
    "Verbindlich ist allein der englische Originaltext der Free Software Foundation. Eine Übersetzung wäre nur ein Hilfsmittel.",
  contents: "Inhalt",
} satisfies LicenseDoc;

const en = {
  title: "License",
  intro: "Nookly is free software, licensed under the GNU Affero General Public License v3.0.",
  name: "GNU Affero General Public License v3.0",
  summary:
    "The strongest copyleft license of the GNU family, written for software that runs on a server. You may use, change and share Nookly, also commercially, as long as you give everyone you pass it on to the same freedoms: the source code stays open under the same license, the notices stay intact, and anyone who runs a changed version as a service for others offers them its source code. It includes a patent grant. There is no warranty.",
  groups: [
    {
      heading: "Permissions",
      items: ["Commercial use", "Modification", "Distribution", "Patent use", "Private use"],
    },
    { heading: "Limitations", items: ["Liability", "Warranty"] },
    {
      heading: "Conditions",
      items: [
        "License and copyright notice",
        "State changes",
        "Disclose source",
        "Network use is distribution",
        "Same license",
      ],
    },
  ],
  licensedUnder: "Nookly is licensed under the",
  disclaimer: "This is a summary, not legal advice.",
  learnMore: "Learn more at gnu.org",
  fullNote: null,
  contents: "Contents",
} satisfies LicenseDoc;

export function license(locale: Locale): LicenseDoc {
  return locale === "de" ? de : en;
}
