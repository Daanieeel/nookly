import { SHARED_SETTINGS, type SharedSettingId } from "@nookly/shared/settings";
import {
  IconChevronRight,
  IconCalendar,
  IconCalendarUser,
  IconArchive,
  IconMathFunction,
  IconSearch,
  IconInfoCircle,
  IconKeyboard,
  IconLayoutSidebar,
  IconSparkles,
  IconNotes,
  IconPalette,
  IconSettings,
  IconUserCircle,
} from "@tabler/icons-react-native";
import { version } from "../../package.json";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { CalendarConnectionsPage } from "./settings/CalendarConnectionsPage.tsx";
import { ShortcutsPage } from "./settings/ShortcutsPage.tsx";
import { SidebarSettingsScreen } from "./settings/SidebarSettings.tsx";
import { WhatsNewScreen } from "./WhatsNewScreen.tsx";
import { useIsTablet } from "../ui/pane.tsx";
import { Text } from "../ui/Text.tsx";
import { useState } from "react";
import { useSyncState } from "../data/context.tsx";
import { GroupedSection, INSET } from "../ui/kit/GroupedSection.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { Label } from "../ui/kit/Label.tsx";
import { OnPage } from "../ui/kit/on-page.ts";
import { ListRow } from "../ui/kit/ListRow.tsx";
import { useSemanticPair } from "../ui/kit/scheme.ts";
import { Tile } from "../ui/kit/Tile.tsx";
import { Button } from "../ui/Button.tsx";
import { SPACE } from "../ui/tokens.ts";
import { useTheme } from "../ui/theme.ts";
import { SearchField } from "../ui/kit/SearchField.tsx";
import { EmptyState } from "../ui/kit/States.tsx";
import type { BadgeLook } from "../ui/kit/badges.ts";
import { Screen } from "../ui/Screen.tsx";
import { AccountPage } from "./settings/AccountPage.tsx";
import { BackupPage } from "./settings/BackupPage.tsx";
import { LatexPage } from "./settings/LatexPage.tsx";
import { HapticsRow } from "./settings/HapticsRow.tsx";
import { SettingRow } from "./settings/SettingRow.tsx";
import { PAGES, SETTING_IDS, SETTING_UI, type SettingsPage, sectionOf } from "./settings/spec.ts";
import { statusText } from "./sync-status.ts";

/// Each page's badge, as iOS's Settings tints its rows (D50).
const PAGE_BADGES = {
  general: { glyph: IconSettings, tint: "gray" },
  appearance: { glyph: IconPalette, tint: "blue" },
  calendar: { glyph: IconCalendar, tint: "red" },
  editor: { glyph: IconNotes, tint: "yellow" },
  latex: { glyph: IconMathFunction, tint: "purple" },
  backup: { glyph: IconArchive, tint: "green" },
} satisfies Record<SettingsPage, BadgeLook>;

interface NavLink {
  title: string;
  subtitle: string;
  /// What a tablet says instead, where the phone's line names something it lacks (haptics).
  tabletSubtitle?: string;
  badge: BadgeLook;
  /// Where it goes; About has nowhere to go and only says the version.
  href?: string;
  /// What a tablet shows beside the list instead of going there (a category of settings,
  /// the account, the connections, the shortcuts).
  pane?: Pane;
  /// Only in a tablet's dialog, where the desktop lists it (the account, the connections).
  tabletOnly?: boolean;
}

/// What a tablet's Settings shows beside its list, as the desktop's Settings dialog.
export type Pane = SettingsPage | "account" | "connections" | "shortcuts" | "sidebar" | "whats-new";

const pageLink = (id: SettingsPage): NavLink => {
  const page = PAGES.find((p) => p.id === id);
  return {
    title: page?.title ?? id,
    subtitle: page?.subtitle ?? "",
    tabletSubtitle: id === "appearance" ? "Theme and file viewer" : undefined,
    badge: PAGE_BADGES[id],
    href: `/settings/${id}`,
    pane: id,
  };
};

/// The pages under the desktop's headings (`settings-pages.ts` `NAV_GROUPS`), with the
/// phone's own pages where the desktop has its counterparts. The account sits on top.
const NAV_GROUPS: { label: string | null; links: NavLink[] }[] = [
  { label: null, links: [pageLink("general"), pageLink("appearance")] },
  { label: "Writing and study", links: [pageLink("editor"), pageLink("calendar")] },
  {
    label: "Data and accounts",
    links: [
      {
        title: "Account",
        subtitle: "Who you are signed in as, and syncing",
        badge: { glyph: IconUserCircle, tint: "blue" },
        href: "/settings/account",
        pane: "account",
        tabletOnly: true,
      },
      pageLink("backup"),
      {
        title: "Connections",
        subtitle: "Moodle's deadlines next to your sessions",
        badge: { glyph: IconCalendarUser, tint: "blue" },
        href: "/settings/calendar-connections",
        pane: "connections",
        tabletOnly: true,
      },
    ],
  },
  {
    label: "Power tools",
    links: [
      {
        title: "Sidebar",
        subtitle: "What it lists first, and in what order",
        badge: { glyph: IconLayoutSidebar, tint: "blue" },
        href: "/settings/sidebar",
        pane: "sidebar",
      },
      {
        title: "Keyboard Shortcuts",
        subtitle: "For an iPad with a keyboard",
        badge: { glyph: IconKeyboard, tint: "gray" },
        href: "/settings/shortcuts",
        pane: "shortcuts",
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
        badge: { glyph: IconSparkles, tint: "pink" },
        href: "/settings/whats-new",
        pane: "whats-new",
      },
      {
        title: "About",
        subtitle: `Nookly ${version}`,
        badge: { glyph: IconInfoCircle, tint: "gray" },
      },
    ],
  },
];

/// Who is signed in (or the way in), at the top of Settings: a card of its own with how
/// syncing goes, a dot in its colour (green synced, red offline or failing).
function AccountCard() {
  const router = useRouter();
  const theme = useTheme();
  const chevron = useSemanticPair("tertiaryLabel");
  const user = useSyncState((s) => s.user);
  const status = useSyncState((s) => s.status);
  const conflicts = status.conflicts;
  const line = user ? statusText(status) : "Keep your phone, tablet and computer in step";
  const dot =
    status.state === "offline" || status.state === "error"
      ? theme.colors.destructive
      : status.state === "idle" || status.state === "syncing"
        ? theme.colors.positive
        : null;
  const title = user ? user.username : "Sign in to sync";
  return (
    <Tile
      accessibilityLabel={[title, line, conflicts > 0 ? `${conflicts} to review` : null]
        .filter(Boolean)
        .join(", ")}
      onPress={() => router.push("/settings/account")}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md }}>
        <IconBadge glyph={IconUserCircle} tint="gray" size={52} />
        <View style={{ flex: 1, gap: SPACE.xxs }}>
          <Label type="title3" numberOfLines={1}>
            {title}
          </Label>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.xs }}>
            {user && dot ? (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
            ) : null}
            <Label type="footnote" color="secondaryLabel" numberOfLines={2} style={{ flex: 1 }}>
              {line}
            </Label>
          </View>
          {conflicts > 0 ? (
            <Label type="footnote" weight="600" tint={theme.colors.caution}>
              {`${conflicts} to review`}
            </Label>
          ) : null}
        </View>
        <IconChevronRight size={18} color={chevron.hex} />
      </View>
    </Tile>
  );
}

/// A category of settings as a tile: its icon, its name and what is in it.
function SettingsTile({ link }: { link: NavLink }) {
  const router = useRouter();
  const icon = useSemanticPair("secondaryLabel");
  const Glyph = link.badge.glyph;
  return (
    <Tile
      accessibilityLabel={`${link.title}, ${link.subtitle}`}
      // SAFETY: every `href` in NAV_GROUPS is a route under `src/app/settings`.
      onPress={() => router.push(link.href as never)}
    >
      <View testID="settings-tile" style={{ minHeight: 92, gap: SPACE.xxs }}>
        <Glyph size={22} color={icon.hex} />
        <View style={{ flex: 1, minHeight: SPACE.sm }} />
        <Label type="headline" numberOfLines={2}>
          {link.title}
        </Label>
        <Label type="footnote" color="secondaryLabel" numberOfLines={2}>
          {link.subtitle}
        </Label>
      </View>
    </Tile>
  );
}

/// The tiles of a group two to a row; one left over takes the whole row.
function TileRows({ links }: { links: NavLink[] }) {
  const rows = links.flatMap((_link, i) => (i % 2 === 0 ? [links.slice(i, i + 2)] : []));
  return (
    <View style={{ gap: SPACE.sm }}>
      {rows.map((row) => (
        <View key={row[0]?.title} style={{ flexDirection: "row", gap: SPACE.sm }}>
          {row.map((link) => (
            <SettingsTile key={link.title} link={link} />
          ))}
        </View>
      ))}
    </View>
  );
}

/// A phone's Settings: the account's card, the categories as tiles under plain headings, and
/// What's New and the version in a quiet line at the end.
function PhoneSettingsHome({ groups }: { groups: typeof NAV_GROUPS }) {
  const router = useRouter();
  const withPages = groups.filter((group) =>
    group.links.every((link) => link.pane !== "whats-new"),
  );
  return (
    <>
      <AccountCard />
      {withPages.map((group, index) => (
        <View key={group.label ?? `group-${index}`} style={{ gap: SPACE.sm }}>
          {group.label ? (
            <Label
              type="headline"
              accessibilityRole="header"
              accessibilityLabel={group.label}
              style={{ paddingHorizontal: SPACE.xs }}
            >
              {group.label}
            </Label>
          ) : null}
          <TileRows links={group.links.filter((link) => link.href !== undefined)} />
        </View>
      ))}
      <View style={{ alignItems: "center", gap: SPACE.xxs }}>
        <Button
          variant="ghost"
          size="sm"
          label="What's New"
          onPress={() => router.push("/settings/whats-new")}
        />
        <Label type="footnote" color="tertiaryLabel">
          {`Nookly ${version}`}
        </Label>
      </View>
    </>
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

/// Settings: the account, then every setting by category, the desktop's own, as iOS's
/// Settings lays them out. On a tablet the desktop's Settings dialog: the categories on the
/// left (the account and connections among them), the picked one beside them, starting on
/// `initial`.
export function SettingsScreen({ initial = "general" }: { initial?: string }) {
  const router = useRouter();
  const tablet = useIsTablet();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Pane>(paneOf(initial));
  const found = query.trim() ? searchSettings(query) : [];
  const beside = (link: NavLink): link is NavLink & { pane: Pane } =>
    tablet && link.pane !== undefined;
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    links: group.links
      .filter((link) => tablet || !link.tabletOnly)
      .map((link) =>
        tablet && link.tabletSubtitle ? { ...link, subtitle: link.tabletSubtitle } : link,
      ),
  }));
  const list = (
    <Screen grouped={tablet}>
      <OnPage.Provider value={!tablet}>
        <SearchField label="Search settings" value={query} onChangeText={setQuery} />
        {query.trim() ? (
          found.length === 0 ? (
            <EmptyState glyph={IconSearch} title="No Results" message="No setting matches." />
          ) : (
            <GroupedSection margin={0}>
              {found.map((id) => (
                <SettingRow key={id} id={id} />
              ))}
            </GroupedSection>
          )
        ) : !tablet ? (
          <PhoneSettingsHome groups={groups} />
        ) : (
          <>
            {groups.map((group, index) => (
              <GroupedSection
                key={group.label ?? `group-${index}`}
                title={group.label ?? undefined}
                margin={0}
                inset={INSET.badge}
              >
                {group.links.map((link) => (
                  <ListRow
                    key={link.title}
                    badge={<IconBadge glyph={link.badge.glyph} tint={link.badge.tint} />}
                    title={link.title}
                    subtitle={link.subtitle}
                    accessory={beside(link) ? "check" : link.href ? "chevron" : "none"}
                    selected={beside(link) ? link.pane === picked : undefined}
                    onPress={
                      beside(link)
                        ? () => setPicked(link.pane)
                        : link.href
                          ? // SAFETY: every `href` in NAV_GROUPS is a route under `src/app/settings`.
                            () => router.push(link.href as never)
                          : undefined
                    }
                  />
                ))}
              </GroupedSection>
            ))}
          </>
        )}
      </OnPage.Provider>
    </Screen>
  );
  if (!tablet) return list;
  return (
    <View className="flex-1 flex-row">
      <ScrollView style={{ width: SETTINGS_LIST_WIDTH, flexGrow: 0 }}>{list}</ScrollView>
      <ScrollView className="flex-1 border-l border-border">
        <View className="px-4 pt-4">
          <Text variant="title" accessibilityRole="header">
            {paneTitle(picked)}
          </Text>
        </View>
        <PaneView pane={picked} />
      </ScrollView>
    </View>
  );
}

const PANES: Pane[] = [
  ...PAGES.map((p) => p.id),
  "account",
  "connections",
  "shortcuts",
  "sidebar",
  "whats-new",
];

/// The pane a route names (`/settings/backup`), General for anything else.
export function paneOf(name: string): Pane {
  return PANES.find((pane) => pane === name) ?? "general";
}

function paneTitle(pane: Pane): string {
  if (pane === "connections") return "Connections";
  if (pane === "shortcuts") return "Keyboard Shortcuts";
  if (pane === "sidebar") return "Sidebar";
  if (pane === "whats-new") return "What's New";
  return settingsTitle(pane);
}

/// One pane of a tablet's Settings: a category's settings, or the page of the same name.
function PaneView({ pane }: { pane: Pane }) {
  if (pane === "connections") {
    return (
      <Screen grouped>
        <CalendarConnectionsPage />
      </Screen>
    );
  }
  if (pane === "shortcuts") return <ShortcutsPage />;
  if (pane === "sidebar") return <SidebarSettingsScreen />;
  if (pane === "whats-new") return <WhatsNewScreen />;
  return <SettingsCategoryScreen page={pane} />;
}

/// How wide a tablet's list of settings categories is, beside the category shown.
const SETTINGS_LIST_WIDTH = 340;

/// One category's settings, in the desktop's words, under a small heading per section.
export function SettingsCategoryScreen({ page }: { page: string }) {
  const tablet = useIsTablet();
  if (page === "account") return <AccountPage />;
  const known = PAGES.find((p) => p.id === page);
  if (known?.id === "latex") {
    return (
      <Screen grouped>
        <LatexPage />
      </Screen>
    );
  }
  if (known?.id === "backup") {
    return (
      <Screen grouped>
        <BackupPage />
      </Screen>
    );
  }
  const ids = SETTING_IDS.filter((id: SharedSettingId) => SETTING_UI[id].page === known?.id);
  const sections = [...new Set(ids.map((id) => sectionOf(id)))];
  return (
    <Screen grouped>
      {known ? (
        sections.map((title) => (
          <GroupedSection key={title ?? "none"} title={title} margin={0}>
            {ids
              .filter((id) => sectionOf(id) === title)
              .map((id) => (
                <SettingRow key={id} id={id} />
              ))}
          </GroupedSection>
        ))
      ) : (
        <EmptyState
          glyph={IconSearch}
          title="Not Found"
          message="There is no such page in Settings."
        />
      )}
      {known?.id === "calendar" && !tablet ? <CalendarConnectionsLink /> : null}
      {/* An iPad has no Taptic Engine (11.3). */}
      {known?.id === "appearance" && !tablet && (
        <GroupedSection title="This phone" margin={0}>
          <HapticsRow />
        </GroupedSection>
      )}
    </Screen>
  );
}

/// Where Moodle's calendar is connected, under the calendar's settings.
function CalendarConnectionsLink() {
  const router = useRouter();
  return (
    <GroupedSection margin={0} inset={INSET.badge}>
      <ListRow
        badge={<IconBadge glyph={IconCalendarUser} tint="blue" />}
        title="Calendar Connections"
        subtitle="Show Moodle's deadlines next to your sessions"
        accessory="chevron"
        onPress={() => router.push("/settings/calendar-connections")}
      />
    </GroupedSection>
  );
}

/// The title a category's screen shows.
export function settingsTitle(page: string): string {
  if (page === "account") return "Account";
  return PAGES.find((p) => p.id === page)?.title ?? "Settings";
}
