import type { SharedSettingId } from "@nookly/shared/settings";
import {
  IconCalendar,
  IconChevronRight,
  IconInfoCircle,
  IconNotes,
  IconPalette,
  IconSettings,
  IconUserCircle,
  type Icon,
} from "@tabler/icons-react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { useSyncState } from "../data/context.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { cn } from "../ui/classes.ts";
import { useTheme } from "../ui/theme.ts";
import { AccountPage } from "./settings/AccountPage.tsx";
import { SettingRow } from "./settings/SettingRow.tsx";
import { PAGES, SETTING_IDS, SETTING_UI, type SettingsPage } from "./settings/spec.ts";
import { statusText } from "./sync-status.ts";

const PAGE_ICONS = {
  general: IconSettings,
  appearance: IconPalette,
  calendar: IconCalendar,
  editor: IconNotes,
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

/// Settings: the account, then every setting by category, the desktop's own.
export function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <Screen>
      <AccountCard />
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
      <Section>
        <Row
          title="About"
          subtitle={`Nookly ${Constants.expoConfig?.version ?? ""}`}
          icon={<IconInfoCircle size={20} color={theme.colors.mutedForeground} />}
        />
      </Section>
    </Screen>
  );
}

/// One category's settings, in the desktop's words.
export function SettingsCategoryScreen({ page }: { page: string }) {
  if (page === "account") return <AccountPage />;
  const known = PAGES.find((p) => p.id === page);
  const ids = SETTING_IDS.filter((id: SharedSettingId) => SETTING_UI[id].page === known?.id);
  return (
    <Screen>
      {known ? (
        <Section>
          {ids.map((id) => (
            <View key={id}>
              <SettingRow id={id} />
            </View>
          ))}
        </Section>
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
