import { type LegalPage, deviceLocale, legalUrl } from "@nookly/shared/api";
import {
  IconFileText,
  IconInfoCircle,
  IconLock,
  IconBrandGithub,
  type Icon,
} from "@tabler/icons-react-native";
import type { ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import { Text } from "../ui/Text.tsx";

export const LEGAL_PAGES: { page: LegalPage; title: string; subtitle: string; glyph: Icon }[] = [
  {
    page: "terms",
    title: "Terms of Service",
    subtitle: "For the sync service",
    glyph: IconFileText,
  },
  { page: "privacy", title: "Privacy Policy", subtitle: "What we store and why", glyph: IconLock },
  { page: "imprint", title: "Imprint", subtitle: "Who runs Nookly", glyph: IconInfoCircle },
  {
    page: "license",
    title: "License",
    subtitle: "Open source under the AGPL",
    glyph: IconBrandGithub,
  },
];

/// A legal page of nookly.work, in the phone's language, opened in the browser.
export function openLegal(page: LegalPage) {
  void Linking.openURL(legalUrl(page, deviceLocale()));
}

const NAMES = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  imprint: "Imprint",
  license: "License",
} satisfies Record<LegalPage, string>;

/// A legal page's name, inside a sentence, as a link.
export function LegalLink({ page, children }: { page: LegalPage; children?: ReactNode }) {
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={NAMES[page]}
      onPress={() => openLegal(page)}
      className="underline text-foreground"
    >
      {children ?? NAMES[page]}
    </Text>
  );
}

/// The terms, the privacy policy and the imprint, quiet and finger sized, at the foot of the
/// sign in and create account pages.
export function LegalFooter() {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Legal"
      className="flex-row flex-wrap items-center justify-center gap-x-5"
    >
      {(["terms", "privacy", "imprint"] as const).map((page) => (
        <Pressable
          key={page}
          accessibilityRole="link"
          accessibilityLabel={NAMES[page]}
          onPress={() => openLegal(page)}
          className="min-h-11 items-center justify-center px-1 active:opacity-60"
        >
          <Text variant="small" tone="muted" className="underline">
            {NAMES[page]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
