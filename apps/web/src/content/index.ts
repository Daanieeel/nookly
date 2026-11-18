import type { Locale } from "@/lib/i18n";
import { de } from "./de";
import { en, type Dictionary } from "./en";

export type { Dictionary };

export function dictionary(locale: Locale): Dictionary {
  return locale === "de" ? de : en;
}
