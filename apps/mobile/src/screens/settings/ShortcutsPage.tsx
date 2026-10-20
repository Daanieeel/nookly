import { View } from "react-native";
import { SHORTCUTS, shortcutLabel } from "../../shell/shortcuts.ts";
import { Row, Section } from "../../ui/Row.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Text } from "../../ui/Text.tsx";

const SECTIONS = ["Navigation", "Tabs", "Create"] as const;

/// The keyboard shortcuts of an iPad with a keyboard, listed as the system's sheet lists
/// them when Command is held: the desktop's keys wherever the desktop has the same action.
export function ShortcutsPage() {
  return (
    <Screen>
      <Text tone="muted">
        Hold Command on an iPad with a keyboard to see these anywhere in Nookly. They are the
        desktop's keys, for the same things.
      </Text>
      {SECTIONS.map((section) => (
        <Section key={section} title={section}>
          {SHORTCUTS.filter((s) => s.section === section).map((shortcut) => (
            <View key={shortcut.id}>
              <Row
                title={shortcut.title}
                trailing={
                  <Text tone="muted" accessibilityLabel={`${shortcut.title} shortcut`}>
                    {shortcutLabel(shortcut)}
                  </Text>
                }
              />
            </View>
          ))}
        </Section>
      ))}
    </Screen>
  );
}
