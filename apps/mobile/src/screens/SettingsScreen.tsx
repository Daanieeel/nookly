import { SHARED_SETTINGS, type SharedSettingId } from "@nookly/shared/settings";
import {
  IconCalendar,
  IconDeviceFloppy,
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
import { useState } from "react";
import { useSyncState } from "../data/context.tsx";
import { GroupedSection, INSET } from "../ui/kit/GroupedSection.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { ListRow } from "../ui/kit/ListRow.tsx";
import { SearchField } from "../ui/kit/SearchField.tsx";
import { EmptyState } from "../ui/kit/States.tsx";
import type { BadgeLook } from "../ui/kit/symbols.ts";
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
  general: { symbol: "gearshape", fallback: IconSettings, tint: "gray" },
  appearance: { symbol: "paintpalette", fallback: IconPalette, tint: "blue" },
  calendar: { symbol: "calendar", fallback: IconCalendar, tint: "red" },
  editor: { symbol: "doc.text", fallback: IconNotes, tint: "yellow" },
  latex: { symbol: "function", fallback: IconMathFunction, tint: "purple" },
  backup: { symbol: "externaldrive", fallback: IconDeviceFloppy, tint: "green" },
} satisfies Record<SettingsPage, BadgeLook>;

interface NavLink {
  title: string;
  subtitle: string;
  badge: BadgeLook;
  /// Where it goes; About has nowhere to go and only says the version.
  href?: string;
}

const pageLink = (id: SettingsPage): NavLink => {
  const page = PAGES.find((p) => p.id === id);
  return {
    title: page?.title ?? id,
    subtitle: page?.subtitle ?? "",
    badge: PAGE_BADGES[id],
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
        badge: { symbol: "sidebar.left", fallback: IconLayoutSidebar, tint: "blue" },
        href: "/settings/sidebar",
      },
      {
        title: "Keyboard Shortcuts",
        subtitle: "For an iPad with a keyboard",
        badge: { symbol: "keyboard", fallback: IconKeyboard, tint: "gray" },
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
        badge: { symbol: "sparkles", fallback: IconSparkles, tint: "pink" },
        href: "/settings/whats-new",
      },
      {
        title: "About",
        subtitle: `Nookly ${version}`,
        badge: { symbol: "info.circle", fallback: IconInfoCircle, tint: "gray" },
      },
    ],
  },
];

/// Who is signed in (or the way in), at the top of Settings like the apps beside it.
function AccountCard() {
  const router = useRouter();
  const user = useSyncState((s) => s.user);
  const status = useSyncState((s) => s.status);
  const conflicts = status.conflicts;
  return (
    <GroupedSection margin={0} inset={INSET.badge}>
      <ListRow
        badge={
          <IconBadge
            symbol="person.crop.circle.fill"
            fallback={IconUserCircle}
            tint="blue"
            size={44}
          />
        }
        title={user ? user.username : "Sign in to sync"}
        subtitle={user ? statusText(status) : "Keep your phone, tablet and computer in step"}
        detail={conflicts > 0 ? `${conflicts} to review` : undefined}
        accessory="chevron"
        onPress={() => router.push("/settings/account")}
      />
    </GroupedSection>
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
/// Settings lays them out.
export function SettingsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const found = query.trim() ? searchSettings(query) : [];
  return (
    <Screen grouped>
      <SearchField
        label="Search settings"
        value={query}
        onChangeText={setQuery}
        placeholder="Search"
      />
      {query.trim() ? (
        found.length === 0 ? (
          <EmptyState
            symbol="magnifyingglass"
            fallback={IconSearch}
            title="No Results"
            message="No setting matches."
          />
        ) : (
          <GroupedSection margin={0}>
            {found.map((id) => (
              <SettingRow key={id} id={id} />
            ))}
          </GroupedSection>
        )
      ) : (
        <>
          <AccountCard />
          {NAV_GROUPS.map((group, index) => (
            <GroupedSection
              key={group.label ?? `group-${index}`}
              title={group.label ?? undefined}
              margin={0}
              inset={INSET.badge}
            >
              {group.links.map((link) => (
                <ListRow
                  key={link.title}
                  badge={
                    <IconBadge
                      symbol={link.badge.symbol}
                      fallback={link.badge.fallback}
                      tint={link.badge.tint}
                    />
                  }
                  title={link.title}
                  subtitle={link.subtitle}
                  accessory={link.href ? "chevron" : "none"}
                  onPress={
                    // SAFETY: every `href` in NAV_GROUPS is a route under `src/app/settings`.
                    link.href ? () => router.push(link.href as never) : undefined
                  }
                />
              ))}
            </GroupedSection>
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
          symbol="questionmark.circle"
          fallback={IconSearch}
          title="Not Found"
          message="There is no such page in Settings."
        />
      )}
      {known?.id === "appearance" && (
        <GroupedSection title="This phone" margin={0}>
          <HapticsRow />
        </GroupedSection>
      )}
    </Screen>
  );
}

/// The title a category's screen shows.
export function settingsTitle(page: string): string {
  if (page === "account") return "Account";
  return PAGES.find((p) => p.id === page)?.title ?? "Settings";
}
