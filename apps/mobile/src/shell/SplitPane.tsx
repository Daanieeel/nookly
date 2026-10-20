import { IconX } from "@tabler/icons-react-native";
import { View } from "react-native";
import { EntityScreen } from "../screens/EntityScreen.tsx";
import { IconButton } from "../ui/Button.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { usePathTitle } from "./TabStrip.tsx";

/// The second page of a split view: an item, with its name on top and a way to close it.
export function SplitPane({ path, onClose }: { path: string; onClose: () => void }) {
  const theme = useTheme();
  const id = /^\/entity\/([^/]+)/.exec(path)?.[1];
  const title = usePathTitle(path);
  return (
    <View accessibilityLabel="Split view" className="flex-1 border-l border-border">
      <View className="h-10 flex-row items-center border-b border-border bg-background pl-4 pr-1">
        <Text numberOfLines={1} className="flex-1 text-muted-foreground">
          {title}
        </Text>
        <IconButton
          label="Close Split View"
          size="iconSm"
          icon={<IconX size={16} color={theme.colors.mutedForeground} />}
          onPress={onClose}
        />
      </View>
      <View className="flex-1">{id ? <EntityScreen id={id} embedded /> : null}</View>
    </View>
  );
}
