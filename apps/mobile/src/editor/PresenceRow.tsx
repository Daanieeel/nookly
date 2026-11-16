import type { Present } from "@nookly/frontend/lib/presence";
import { View } from "react-native";
import { Text } from "../ui/Text.tsx";
import { CORNER } from "../ui/tokens.ts";
import { useTheme } from "../ui/theme.ts";

/// Who else has this page open, as the desktop's `PresenceBar`: each person's initial on
/// their caret's colour, at most five, overlapping a little at the page's top right.
export function PresenceRow({ present }: { present: Present[] }) {
  const theme = useTheme();
  if (present.length === 0) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Also on this page: ${present.map((p) => p.name).join(", ")}`}
      className="flex-row self-end"
    >
      {present.slice(0, 5).map((person, i) => (
        <View
          key={person.clientId}
          className="size-6 items-center justify-center rounded-md border-2"
          style={[
            CORNER,
            {
              marginLeft: i === 0 ? 0 : -6,
              backgroundColor: person.color,
              borderColor: theme.colors.background,
            },
          ]}
        >
          <Text variant="small" className="font-semibold uppercase text-white">
            {person.name.slice(0, 1)}
          </Text>
        </View>
      ))}
    </View>
  );
}
