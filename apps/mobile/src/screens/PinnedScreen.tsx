import { IconPin } from "@tabler/icons-react-native";
import { useEntityMenu } from "./entity-actions.tsx";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { usePinned, useSpaces } from "../data/queries.ts";
import { Band } from "../ui/Band.tsx";
import { SpaceDot } from "../ui/Badge.tsx";
import { EntityIcon, MODULE_ICONS } from "../ui/icons.tsx";
import { ListTitle } from "../ui/ListBar.tsx";
import { Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { groupPinned } from "./pinned-groups.ts";

/// Everything pinned, across every Space: a section per Space, and in it a small heading per
/// module with its items as compact rows.
export function PinnedScreen() {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const theme = useTheme();
  const { data: pinned = [] } = usePinned();
  const { data: spaces = [] } = useSpaces();
  const sections = groupPinned(
    pinned,
    spaces.map((s) => s.id),
  );
  return (
    <Screen>
      <ListTitle title="Pinned" count={pinned.length} />
      {sections.length === 0 ? (
        <View className="items-center gap-2 p-8">
          <IconPin size={28} color={theme.colors.mutedForeground} />
          <Text tone="muted" className="text-center">
            Nothing pinned yet. Pin an item from anywhere to keep it one tap away.
          </Text>
        </View>
      ) : null}
      {sections.map((section) => {
        const space = spaces.find((s) => s.id === section.spaceId);
        return (
          <Band
            key={section.spaceId}
            icon={<SpaceDot color={space?.color ?? theme.colors.mutedForeground} />}
            title={space?.name ?? "Space"}
            count={section.count}
          >
            <View className="gap-3">
              {section.groups.map((group) => (
                <View key={group.label} className="gap-1">
                  <View className="flex-row items-center gap-2 px-1">
                    {group.module
                      ? (() => {
                          const Glyph = MODULE_ICONS[group.module];
                          return <Glyph size={14} color={theme.colors.mutedForeground} />;
                        })()
                      : null}
                    <Text variant="small" tone="muted">
                      {group.label}
                    </Text>
                    <Text variant="small" tone="muted">
                      {group.items.length}
                    </Text>
                  </View>
                  <Section>
                    {group.items.map((entity) => (
                      <View key={entity.id}>
                        <Row
                          title={entity.title || "Untitled"}
                          subtitle={entity.key}
                          icon={<EntityIcon type={entity.type} icon={entity.icon} />}
                          onPress={() => router.push(`/entity/${entity.id}`)}
                          onLongPress={() => entityMenu(entity)}
                        />
                      </View>
                    ))}
                  </Section>
                </View>
              ))}
            </View>
          </Band>
        );
      })}
    </Screen>
  );
}
