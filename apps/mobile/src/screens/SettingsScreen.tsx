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
import { version } from "../../package.json";
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

interface NavLink {
  title: string;
  subtitle: string;
  icon: Icon;
  /// Where it goes; About has nowhere to go and only says the version.
  href?: string;
}

const pageLink = (id: SettingsPage): NavLink => {
  const page = PAGES.find((p) => p.id === id);
  return {
    title: page?.title ?? id,
    subtitle: page?.subtitle ?? "",
    icon: PAGE_ICONS[id],
    href: `/settings/${id}`,
  };
};

/// The pages under the desktop's headings (`settings-pages.ts` `NAV_GROUPS`), with the
/// phone's own pages where the desktop has its counterparts. The account sits on top.
const NAV_GROUPS: { label: string | null; links: NavLink[] }[] = [
  { label: null, links: [pageLink("general"), pageLink("appearance")] },
  { label: "Writing and study", links: [pageLink("editor"), pageLink("calendar")] },
  { label: "Data and accounts", links: [pageLink("backup")] },
  {
    label: "Power tools",
    links: [
      {
        title: "Sidebar",
        subtitle: "What it lists first, and in what order",
        icon: IconLayoutSidebar,
        href: "/settings/sidebar",
      },
      {
        title: "Keyboard Shortcuts",
        subtitle: "For an iPad with a keyboard",
        icon: IconKeyboard,
        href: "/settings/shortcuts",
      },
      pageLink("latex"),
    ],
  },
  {
    label: null,
    links: [
      {
        title: "What's New",
        subtitle: "What changed in Nookly",
        icon: IconSparkles,
        href: "/settings/whats-new",
      },
      { title: "About", subtitle: `Nookly ${version}`, icon: IconInfoCircle },
    ],
  },
];

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
        <>
          {NAV_GROUPS.map((group, index) => (
            <Section key={group.label ?? `group-${index}`} title={group.label ?? undefined}>
              {group.links.map((link) => {
                const Glyph = link.icon;
                return (
                  <View key={link.title}>
                    <Row
                      title={link.title}
                      subtitle={link.subtitle}
                      icon={<Glyph size={20} color={theme.colors.mutedForeground} />}
                      trailing={
                        link.href ? (
                          <IconChevronRight size={16} color={theme.colors.mutedForeground} />
                        ) : undefined
                      }
                      onPress={
                        // SAFETY: every `href` in NAV_GROUPS is a route under `src/app/settings`.
                        link.href ? () => router.push(link.href as never) : undefined
                      }
                    />
                  </View>
                );
              })}
            </Section>
          ))}
        </>
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
