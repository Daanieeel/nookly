import { SHORTCUTS, shortcutLabel } from "../../shell/shortcuts.ts";
import { GroupedSection } from "../../ui/kit/GroupedSection.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { ListRow } from "../../ui/kit/ListRow.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { SPACE } from "../../ui/tokens.ts";

const SECTIONS = ["Navigation", "Tabs", "Create"] as const;

/// The keyboard shortcuts of an iPad with a keyboard, listed as the system's sheet lists
/// them when Command is held: the desktop's keys wherever the desktop has the same action.
export function ShortcutsPage() {
  return (
    <Screen grouped>
      <Label type="footnote" color="secondaryLabel" style={{ paddingHorizontal: SPACE.lg }}>
        Hold Command on an iPad with a keyboard to see these anywhere in Nookly. They are the
        desktop's keys, for the same things.
      </Label>
      {SECTIONS.map((section) => (
        <GroupedSection key={section} title={section} margin={0}>
          {SHORTCUTS.filter((s) => s.section === section).map((shortcut) => (
            <ListRow
              key={shortcut.id}
              title={shortcut.title}
              detail={shortcutLabel(shortcut)}
              accessibilityRole="text"
              accessibilityLabel={`${shortcut.title}, ${shortcutLabel(shortcut)}`}
            />
          ))}
        </GroupedSection>
      ))}
    </Screen>
  );
}
