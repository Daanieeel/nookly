import { VIM_KEY_GROUPS } from "@nookly/shared/vim";
import { View } from "react-native";
import { Text } from "../ui/Text.tsx";

/// The keys Vim mode understands, as the desktop's `?` list shows them: keys on the left in
/// the code font, what they do beside them.
export function VimKeys() {
  return (
    <View className="gap-4 pb-4">
      <Text tone="muted">
        The keys for pages in normal mode, with a keyboard attached. Turn Vim keys off under
        Settings, Editor.
      </Text>
      {VIM_KEY_GROUPS.map((group) => (
        <View key={group.title} accessibilityLabel={group.title} className="gap-1.5">
          <Text variant="label">{group.title}</Text>
          {group.keys.map(([keys, what]) => (
            <View key={keys} className="flex-row gap-3">
              <Text variant="small" className="w-28 font-mono">
                {keys}
              </Text>
              <Text variant="small" tone="muted" className="flex-1">
                {what}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
