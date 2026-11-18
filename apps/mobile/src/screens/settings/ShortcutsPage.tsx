import { useEffect, useState } from "react";
import { View } from "react-native";
import * as system from "../../../modules/nookly-keys/src/index.ts";
import {
  FIXED_KEYS,
  type KeyChange,
  type KeyPlan,
  type KeyRecorder,
  keysOf,
  planKeys,
  planReset,
  sameKeys,
  useKeyChanges,
} from "../../shell/shortcut-keys.ts";
import { SHORTCUTS, type Shortcut, type ShortcutId, shortcutLabel } from "../../shell/shortcuts.ts";
import { Button } from "../../ui/Button.tsx";
import { GroupedSection } from "../../ui/kit/GroupedSection.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { ListRow } from "../../ui/kit/ListRow.tsx";
import { useMenu } from "../../ui/menu.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { SPACE } from "../../ui/tokens.ts";

const SECTIONS = ["Navigation", "Tabs", "Create"] as const;

const titleOf = (id: ShortcutId) => SHORTCUTS.find((s) => s.id === id)?.title ?? id;

/// Whether a keyboard is connected, kept up to date.
function useKeyboard(keys: KeyRecorder): boolean {
  const [connected, setConnected] = useState(() => keys.hasKeyboard());
  useEffect(() => keys.onKeyboardChange(setConnected), [keys]);
  return connected;
}

/// One shortcut: its keys on the right; pressed, it listens for new ones. A changed one
/// can go back to Nookly's keys.
function ShortcutRow({
  shortcut,
  changes,
  editable,
  recording,
  error,
  onRecord,
  onReset,
}: {
  shortcut: Shortcut;
  changes: KeyChange[];
  editable: boolean;
  recording: boolean;
  error: string | null;
  onRecord: () => void;
  onReset: () => void;
}) {
  const keys = keysOf(changes, shortcut.id);
  const label = keys ? shortcutLabel(keys) : null;
  const changed = changes.some((c) => c.id === shortcut.id);
  const hint = recording ? (error ?? "Press the new keys, or Escape to cancel.") : undefined;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ flex: 1 }}>
        <ListRow
          title={shortcut.title}
          subtitle={hint}
          detail={recording ? "Press a Shortcut" : (label ?? "Not set")}
          onPress={editable ? onRecord : undefined}
          accessibilityRole={editable ? "button" : "text"}
          accessibilityLabel={
            editable
              ? `Change ${shortcut.title} shortcut, ${label ? `now ${label}` : "not set"}`
              : `${shortcut.title}, ${label ?? "not set"}`
          }
        />
      </View>
      {editable && changed && !recording ? (
        <Button
          label="Reset"
          variant="ghost"
          size="sm"
          accessibilityLabel={`Reset ${shortcut.title}`}
          onPress={onReset}
        />
      ) : null}
    </View>
  );
}

/// The keyboard shortcuts of an iPad with a keyboard, the desktop's keys wherever the
/// desktop has the same action. With a keyboard connected each one changes as the
/// desktop's do: press it, press the new keys (8.6).
export function ShortcutsPage({ keys = system }: { keys?: KeyRecorder }) {
  const menu = useMenu();
  const keyboard = useKeyboard(keys);
  const [changes, write] = useKeyChanges();
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = () => {
    setRecording(null);
    setError(null);
  };
  /// Stores a plan's keys, asking first when they move from another shortcut.
  const carry = (id: ShortcutId, plan: KeyPlan, pressed: string) => {
    if (plan.kind === "apply") return write(plan.next);
    if (plan.kind !== "conflict") return;
    const title = titleOf(id);
    const other = titleOf(plan.other);
    menu.confirm({
      title: `Reassign ${pressed} to ${title}?`,
      description: `${pressed} is used by ${other} right now. If you reassign it, ${title} gets ${pressed} and ${other} has no shortcut until you give it one. Nothing is lost: you can give ${other} new keys at any time.`,
      actions: [{ label: "Reassign", onPress: () => write(plan.next) }],
    });
  };

  useEffect(() => {
    if (!recording) return;
    return keys.record((pressed) => {
      if (pressed.key === "UIKeyInputEscape" && pressed.modifiers.length === 0) return stop();
      const held = keysOf(changes, recording);
      if (held && sameKeys(held, pressed)) return stop();
      const plan = planKeys(changes, recording, pressed);
      const label = shortcutLabel(pressed);
      if (plan.kind === "invalid") return setError(plan.message);
      if (plan.kind === "fixed") {
        return setError(`${label} is used for "${plan.label}", which can't be changed.`);
      }
      stop();
      carry(recording, plan, label);
    });
    // `carry` and `stop` only read state through the values listed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, changes, keys]);

  const resetAll = () =>
    menu.confirm({
      title: "Reset all shortcuts?",
      description:
        "Every shortcut you changed goes back to the keys Nookly comes with. Shortcuts you never changed stay as they are, and no other setting is touched.",
      actions: [{ label: "Reset", destructive: true, onPress: () => write([]) }],
    });

  return (
    <Screen grouped>
      <View style={{ gap: SPACE.sm, paddingHorizontal: SPACE.lg }}>
        <Label type="footnote" color="secondaryLabel">
          {keyboard
            ? "Hold Command to see these anywhere in Nookly. Press one to give it new keys. Keys can do one thing only: taking keys in use asks you first."
            : "Hold Command on an iPad with a keyboard to see these anywhere in Nookly. Connect a keyboard to change these."}
        </Label>
        {keyboard ? (
          <View style={{ alignSelf: "flex-start" }}>
            <Button
              label="Reset All Shortcuts"
              variant="secondary"
              size="sm"
              disabled={changes.length === 0}
              onPress={resetAll}
            />
          </View>
        ) : null}
      </View>
      {SECTIONS.map((section) => (
        <GroupedSection key={section} title={section} margin={0}>
          {SHORTCUTS.filter((s) => s.section === section).map((shortcut) => (
            <ShortcutRow
              key={shortcut.id}
              shortcut={shortcut}
              changes={changes}
              editable={keyboard}
              recording={recording === shortcut.id}
              error={recording === shortcut.id ? error : null}
              onRecord={() => {
                setError(null);
                setRecording(shortcut.id);
              }}
              onReset={() =>
                carry(shortcut.id, planReset(changes, shortcut.id), shortcutLabel(shortcut))
              }
            />
          ))}
        </GroupedSection>
      ))}
      <GroupedSection
        title="Fixed Shortcuts"
        footer="These keys have a fixed meaning and can't be changed."
        margin={0}
      >
        {FIXED_KEYS.map((fixed) => (
          <ListRow
            key={fixed.label}
            title={fixed.label}
            detail={shortcutLabel(fixed.keys)}
            accessibilityRole="text"
          />
        ))}
      </GroupedSection>
    </Screen>
  );
}
