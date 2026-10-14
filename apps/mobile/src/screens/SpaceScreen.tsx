import { MODULE_LABELS, type ModuleKey, isModuleKey } from "@nookly/shared/modules";
import { Stack, useRouter } from "expo-router";
import { IconSettings } from "@tabler/icons-react-native";
import { View } from "react-native";
import { IconButton } from "../ui/Button.tsx";
import { useSpaceModules, useSpaces } from "../data/queries.ts";
import { MODULE_ICONS } from "../ui/icons.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { useTheme } from "../ui/theme.ts";

/// What the phone can start in a Space; a module joins the Space with its first item.
const PHONE_MODULES: ModuleKey[] = [
  "tasks",
  "notes",
  "jots",
  "calendar",
  "bookmarks",
  "courses",
  "exams",
  "assignments",
  "decks",
];

/// One Space: the modules it uses, in its order, and the ones it could start.
export function SpaceScreen({ spaceId }: { spaceId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: spaces = [] } = useSpaces();
  const { data: modules = [] } = useSpaceModules(spaceId);
  const space = spaces.find((s) => s.id === spaceId);
  const shown = modules.filter(isModuleKey);
  const more = PHONE_MODULES.filter((m) => !shown.includes(m));
  const rows = (keys: ModuleKey[]) =>
    keys.map((module) => {
      const Icon = MODULE_ICONS[module];
      return (
        <View key={module}>
          <Row
            title={MODULE_LABELS[module]}
            icon={<Icon size={18} color={theme.colors.mutedForeground} />}
            onPress={() => router.push(`/module/${spaceId}/${module}`)}
          />
        </View>
      );
    });
  return (
    <>
      <Stack.Screen
        options={{
          title: space?.name ?? "Space",
          headerRight: () => (
            <IconButton
              label="Space Settings"
              icon={<IconSettings size={20} color={theme.colors.foreground} />}
              onPress={() => router.push(`/space-settings/${spaceId}`)}
            />
          ),
        }}
      />
      <Screen>
        <Section>
          {shown.length === 0 ? <Empty text="Nothing in this Space yet." /> : null}
          {rows(shown)}
        </Section>
        {more.length > 0 ? <Section title="Start something">{rows(more)}</Section> : null}
      </Screen>
    </>
  );
}
