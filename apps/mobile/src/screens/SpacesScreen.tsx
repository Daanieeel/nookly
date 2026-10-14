import { IconPlus, IconTrash } from "@tabler/icons-react-native";
import { MODULE_LABELS, isModuleKey } from "@nookly/shared/modules";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { useSpaceModules, useSpaces } from "../data/queries.ts";
import { SpaceDot } from "../ui/Badge.tsx";
import { IconButton } from "../ui/Button.tsx";
import { MODULE_ICONS } from "../ui/icons.tsx";
import { Empty, Row, Section, Separator } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { useTheme } from "../ui/theme.ts";
import { useSyncRefresh } from "./useSyncRefresh.ts";

/// Every Space, as in the desktop's sidebar, with Trash at the bottom.
export function SpacesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: spaces = [] } = useSpaces();
  const { refreshing, onRefresh } = useSyncRefresh();
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              label="New Space"
              icon={<IconPlus size={22} color={theme.colors.foreground} />}
              onPress={() => router.push("/new/space")}
            />
          ),
        }}
      />
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <Section>
          {spaces.length === 0 ? (
            <Empty text="No Spaces yet. Make one, or sign in to sync yours." />
          ) : null}
          {spaces.map((space, i) => (
            <View key={space.id}>
              {i > 0 ? <Separator /> : null}
              <Row
                title={space.name}
                icon={space.icon ? undefined : <SpaceDot color={space.color} />}
                onPress={() => router.push(`/space/${space.id}`)}
              />
            </View>
          ))}
        </Section>
        <Section>
          <Row
            title="Trash"
            icon={<IconTrash size={18} color={theme.colors.mutedForeground} />}
            onPress={() => router.push("/trash")}
          />
        </Section>
      </Screen>
    </>
  );
}

/// One Space: the modules it uses, in its order.
export function SpaceScreen({ spaceId }: { spaceId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: spaces = [] } = useSpaces();
  const { data: modules = [] } = useSpaceModules(spaceId);
  const space = spaces.find((s) => s.id === spaceId);
  const shown = modules.filter(isModuleKey);
  return (
    <>
      <Stack.Screen options={{ title: space?.name ?? "Space" }} />
      <Screen>
        <Section>
          {shown.length === 0 ? <Empty text="Nothing in this Space yet." /> : null}
          {shown.map((module, i) => {
            const Icon = MODULE_ICONS[module];
            return (
              <View key={module}>
                {i > 0 ? <Separator /> : null}
                <Row
                  title={MODULE_LABELS[module]}
                  icon={<Icon size={18} color={theme.colors.mutedForeground} />}
                  onPress={() => router.push(`/module/${spaceId}/${module}`)}
                />
              </View>
            );
          })}
        </Section>
      </Screen>
    </>
  );
}
