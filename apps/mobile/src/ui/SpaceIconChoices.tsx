import { ICON_LIBRARY_NAMES, iconLibraryValue } from "@nookly/shared/icons";
import { IconMoodSmile } from "@tabler/icons-react-native";
import { View } from "react-native";
import { Button } from "./Button.tsx";
import { ICON_LIBRARY, IconValue } from "./icons.tsx";
import { IconGrid } from "./kit/IconGrid.tsx";
import { Surface } from "./kit/Surface.tsx";
import { useTheme } from "./theme.ts";
import { SPACE } from "./tokens.ts";

/// A Space's icon, picked where its settings are: every icon Nookly offers, laid out at once
/// in the Space's color, then an emoji from a sheet of emoji alone. The one picker for any
/// other item (`IconPickerScreen`) stays as it is.
export function SpaceIconChoices({
  value,
  color,
  onPick,
  onChooseEmoji,
}: {
  value: string | null;
  color: string;
  onPick: (icon: string) => void;
  onChooseEmoji: () => void;
}) {
  const theme = useTheme();
  const emoji = value && !value.startsWith("icon:") ? value : null;
  return (
    <Surface title="Icon">
      <View style={{ gap: SPACE.sm }}>
        <IconGrid
          cells={ICON_LIBRARY_NAMES.map((name) => {
            const Glyph = ICON_LIBRARY[name];
            return {
              key: name,
              label: name,
              selected: value === iconLibraryValue(name) || (!value && name === "Folder"),
              onPress: () => onPick(iconLibraryValue(name)),
              content: <Glyph size={24} color={color} />,
            };
          })}
        />
        <Button
          label="Choose Emoji"
          variant="ghost"
          icon={
            emoji ? (
              <IconValue value={emoji} size={18} fallback={color} />
            ) : (
              <IconMoodSmile size={18} color={theme.colors.foreground} />
            )
          }
          onPress={onChooseEmoji}
        />
      </View>
    </Surface>
  );
}
