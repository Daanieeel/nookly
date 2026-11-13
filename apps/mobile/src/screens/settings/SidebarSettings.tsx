import { Switch, View } from "react-native";
import { usePreference } from "../../data/preferences.ts";
import { ROW_DIVIDER, Section } from "../../ui/Row.tsx";
import { ReorderList } from "../../ui/ReorderList.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Text } from "../../ui/Text.tsx";
import { cn } from "../../ui/classes.ts";
import { haptic } from "../../ui/haptics.ts";
import { TYPE } from "../../ui/tokens.ts";
import { DEFAULT_TOP, type TopId, orderedTop, topSchema } from "../sidebar-top.ts";

/// A row's height, which the drag moves by.
const ROW = 56;

/// Which overviews the sidebar lists at the top, and in what order: rows dragged into
/// place, a switch to show each. Kept on this phone, like the desktop's.
export function SidebarSettingsScreen() {
  const [pref, setPref] = usePreference("sidebar.top", topSchema, DEFAULT_TOP);
  const items = orderedTop(pref);
  const ids = items.map((i) => i.id);
  const show = (id: TopId, on: boolean) =>
    setPref({
      order: ids,
      hidden: on ? pref.hidden.filter((h) => h !== id) : [...pref.hidden, id],
    });
  return (
    <Screen>
      <Text tone="muted">
        Choose what the sidebar lists first. Hold a row, or its grip, and drag it into place.
      </Text>
      <Section>
        <ReorderList
          items={items}
          keyOf={(item) => item.id}
          labelOf={(item) => item.label}
          size={ROW}
          // SAFETY: the keys are the items' own ids, given back in a new order.
          onReorder={(order) => setPref({ ...pref, order: order as TopId[] })}
          renderItem={(item) => (
            <View
              className={cn("gap-3 pl-4", ROW_DIVIDER)}
              style={{ minHeight: ROW, flexDirection: "row", alignItems: "center" }}
            >
              <Text className="flex-1" style={{ fontSize: TYPE.body.fontSize }}>
                {item.label}
              </Text>
              <View style={{ height: ROW, justifyContent: "center" }}>
                <Switch
                  accessibilityLabel={`Show ${item.label}`}
                  value={!pref.hidden.includes(item.id)}
                  onValueChange={(on) => {
                    haptic("toggle");
                    show(item.id, on);
                  }}
                />
              </View>
            </View>
          )}
        />
      </Section>
    </Screen>
  );
}
