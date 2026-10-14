import { Pressable, ScrollView } from "react-native";
import { useSpaces } from "../data/queries.ts";
import { SpaceDot } from "../ui/Badge.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";

/// Which Space something new goes into: every entity belongs to exactly one.
export function SpacePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (spaceId: string) => void;
}) {
  const theme = useTheme();
  const { data: spaces = [] } = useSpaces();
  if (spaces.length === 0) return <Text tone="muted">Make a Space first, under Spaces.</Text>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Space"
      contentContainerStyle={{ gap: theme.space(2) }}
    >
      {spaces.map((space) => {
        const selected = space.id === value;
        return (
          <Pressable
            key={space.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={space.name}
            onPress={() => onChange(space.id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(1.5),
              minHeight: 36,
              paddingHorizontal: theme.space(3),
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: selected ? space.color : theme.colors.input,
              backgroundColor: selected ? `${space.color}1a` : theme.colors.secondary,
            }}
          >
            <SpaceDot color={space.color} />
            <Text variant="label">{space.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
