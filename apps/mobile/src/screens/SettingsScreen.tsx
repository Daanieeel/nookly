import { SHARED_SETTINGS, type SharedSettingId } from "@nookly/shared/settings";
import {
  IconCalendar,
  IconDeviceFloppy,
  IconMathFunction,
  IconChevronRight,
  IconInfoCircle,
  IconKeyboard,
  IconLayoutSidebar,
  IconSparkles,
  IconNotes,
  IconPalette,
  IconSettings,
  IconUserCircle,
  type Icon,
} from "@tabler/icons-react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useSyncState } from "../data/context.tsx";
import { Badge } from "../ui/Badge.tsx";
import { FilterField } from "../ui/ListBar.tsx";
import { Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { cn } from "../ui/classes.ts";
import { useTheme } from "../ui/theme.ts";
import { AccountPage } from "./settings/AccountPage.tsx";
import { BackupPage } from "./settings/BackupPage.tsx";
import { LatexPage } from "./settings/LatexPage.tsx";
import { SettingRow } from "./settings/SettingRow.tsx";
import { PAGES, SETTING_IDS, SETTING_UI, type SettingsPage, sectionOf } from "./settings/spec.ts";
import { statusText } from "./sync-status.ts";

const PAGE_ICONS = {
  general: IconSettings,
  appearance: IconPalette,
  calendar: IconCalendar,
  editor: IconNotes,
  latex: IconMathFunction,
  backup: IconDeviceFloppy,
} satisfies Record<SettingsPage, Icon>;

/// Who is signed in (or the way in), at the top of Settings like the apps beside it.
function AccountCard() {
  const router = useRouter();
  const theme = useTheme();
  const user = useSyncState((s) => s.user);
  const status = useSyncState((s) => s.status);
  const conflicts = status.conflicts;
  return (
    <Section>
      <Row
        title={user ? user.username : "Sign in to sync"}
        subtitle={user ? statusText(status) : "Keep your phone, tablet and computer in step"}
        icon={<IconUserCircle size={28} color={theme.colors.primary} />}
        trailing={
          conflicts > 0 ? (
            <Badge label={`${conflicts} to review`} variant="warning" />
          ) : (
            <IconChevronRight size={16} color={theme.colors.mutedForeground} />
          )
        }
        onPress={() => router.push("/settings/account")}
      />
    </Section>
  );
}

/// Settings that match what was typed, across every category, by their title, what they do
/// and the other words people look for.
export function searchSettings(query: string): SharedSettingId[] {
  const q = query.trim().toLowerCase();
  return SETTING_IDS.filter((id) => {
    const def = SHARED_SETTINGS[id];
    return [def.title, def.description, ...def.synonyms].join(" ").toLowerCase().includes(q);
  });
}

/// Settings: the account, then every setting by category, the desktop's own.
export function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const found = query.trim() ? searchSettings(query) : [];
  return (
    <Screen>
      <FilterField label="Search settings" value={query} onChange={setQuery} />
      {query.trim() ? (
        <Section>
          {found.length === 0 ? (
            <Text tone="muted" className="p-4">
              No setting matches.
            </Text>
          ) : null}
          {found.map((id) => (
            <View key={id}>
              <SettingRow id={id} />
            </View>
          ))}
        </Section>
      ) : null}
      {query.trim() ? null : <AccountCard />}
      {query.trim() ? null : (
        <Section>
          {PAGES.map((page) => {
            const Glyph = PAGE_ICONS[page.id];
            return (
              <View key={page.id}>
                <Row
                  title={page.title}
                  subtitle={page.subtitle}
                  icon={<Glyph size={20} color={theme.colors.mutedForeground} />}
                  trailing={<IconChevronRight size={16} color={theme.colors.mutedForeground} />}
                  onPress={() => router.push(`/settings/${page.id}`)}
                />
              </View>
            );
          })}
        </Section>
      )}
      {query.trim() ? null : (
        <Section>
          <Row
            title="Sidebar"
            subtitle="What it lists first, and in what order"
            icon={<IconLayoutSidebar size={20} color={theme.colors.mutedForeground} />}
            trailing={<IconChevronRight size={16} color={theme.colors.mutedForeground} />}
            onPress={() => router.push("/settings/sidebar")}
          />
          <Row
            title="Keyboard Shortcuts"
            subtitle="For an iPad with a keyboard"
            icon={<IconKeyboard size={20} color={theme.colors.mutedForeground} />}
            trailing={<IconChevronRight size={16} color={theme.colors.mutedForeground} />}
            onPress={() => router.push("/settings/shortcuts")}
          />
          <Row
            title="What's New"
            subtitle="What changed in Nookly"
            icon={<IconSparkles size={20} color={theme.colors.mutedForeground} />}
            trailing={<IconChevronRight size={16} color={theme.colors.mutedForeground} />}
            onPress={() => router.push("/settings/whats-new")}
          />
          <Row
            title="About"
            subtitle={`Nookly ${Constants.expoConfig?.version ?? ""}`}
            icon={<IconInfoCircle size={20} color={theme.colors.mutedForeground} />}
          />
        </Section>
      )}
    </Screen>
  );
}

/// One category's settings, in the desktop's words, under a small heading per section.
export function SettingsCategoryScreen({ page }: { page: string }) {
  if (page === "account") return <AccountPage />;
  const known = PAGES.find((p) => p.id === page);
  if (known?.id === "latex") {
    return (
      <Screen>
        <LatexPage />
      </Screen>
    );
  }
  if (known?.id === "backup") {
    return (
      <Screen>
        <BackupPage />
      </Screen>
    );
  }
  const ids = SETTING_IDS.filter((id: SharedSettingId) => SETTING_UI[id].page === known?.id);
  const sections = [...new Set(ids.map((id) => sectionOf(id)))];
  return (
    <Screen>
      {known ? (
        sections.map((title) => (
          <Section key={title ?? "none"} title={title}>
            {ids
              .filter((id) => sectionOf(id) === title)
              .map((id) => (
                <View key={id}>
                  <SettingRow id={id} />
                </View>
              ))}
          </Section>
        ))
      ) : (
        <Text tone="muted" className={cn("p-4")}>
          There is no such page in Settings.
        </Text>
      )}
    </Screen>
  );
}

/// The title a category's screen shows.
export function settingsTitle(page: string): string {
  if (page === "account") return "Account";
  return PAGES.find((p) => p.id === page)?.title ?? "Settings";
}
