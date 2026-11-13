import type { EntityRecord } from "@nookly/shared/data";
import { INPUT_CLASSES } from "@nookly/ui/classes";
import { IconSearch } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { useRecents, useSearch } from "../data/queries.ts";
import { cn, splitText, row } from "../ui/classes.ts";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { useTheme } from "../ui/theme.ts";
import { COMMANDS, type PaletteCommand, filterCommands } from "./commands.ts";
import { type Shortcut, SHORTCUTS, shortcutLabel } from "./shortcuts.ts";
import { type PaletteMode, useShell } from "./store.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

const PLACEHOLDER = {
  search: "Search titles, keys and page text, or run a command",
  quick: "Jump to an item by name",
  commands: "Run a command",
} satisfies Record<PaletteMode, string>;

function shortcutOf(command: PaletteCommand): string | null {
  const shortcut = SHORTCUTS.find((s: Shortcut) => s.id === command.shortcut);
  return shortcut ? shortcutLabel(shortcut) : null;
}

/// The desktop's Cmd+K, Cmd+P and Cmd+Shift+P in one place: a box over the page that
/// finds items and runs commands. `onAction` carries out what only the window knows how
/// to do (collapse the sidebar, go back).
export function CommandPalette({ onAction }: { onAction: (action: AppAction) => void }) {
  const mode = useShell((s) => s.palette);
  const close = useShell((s) => s.close);
  const router = useRouter();
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (mode === null) setQuery("");
  }, [mode]);
  const trimmed = query.trim();
  const { data: found = [] } = useSearch(mode === "commands" ? "" : trimmed);
  const { data: recent = [] } = useRecents();
  if (mode === null) return null;

  const entities: EntityRecord[] =
    mode === "commands" ? [] : trimmed ? found.slice(0, 12) : recent.slice(0, 8);
  const commands =
    mode === "quick" ? [] : filterCommands(COMMANDS, trimmed).slice(0, trimmed ? 8 : 20);
  const openEntity = (entity: EntityRecord) => {
    close();
    router.push(`/entity/${entity.id}`);
  };
  const run = (command: PaletteCommand) => {
    close();
    if (command.route) router.push(command.route);
    else if (command.action) onAction(command.action);
  };
  const submit = () => {
    const [entity] = entities;
    const [command] = commands;
    if (entity) openEntity(entity);
    else if (command) run(command);
  };
  const { box, text } = splitText(row(INPUT_CLASSES));
  const empty = trimmed ? "Nothing matches." : "Nothing opened yet.";
  return (
    // Over the window, not a system modal: a modal that closes while the page behind it
    // changes brought the whole app down.
    <View className="absolute inset-0 z-50" pointerEvents="box-none">
      <Pressable
        accessibilityLabel="Close"
        onPress={close}
        className="flex-1 items-center bg-black/40 px-6"
        style={{ paddingTop: Math.max(48, height * 0.12) }}
      >
        <Pressable
          // Taps inside must not reach the backdrop.
          onPress={() => {}}
          accessibilityViewIsModal
          className="overflow-hidden rounded-xl border border-border bg-popover"
          style={{ width: Math.min(640, width - 48), maxHeight: height * 0.45 }}
        >
          <View className={cn(box, "h-12 items-center gap-2 rounded-none border-0 border-b px-4")}>
            <IconSearch size={18} color={theme.colors.mutedForeground} />
            <TextInput
              autoFocus
              accessibilityLabel="Search everything"
              placeholder={PLACEHOLDER[mode]}
              placeholderTextColor={theme.colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={submit}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="go"
              className={cn(text, "flex-1 font-sans text-foreground")}
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 p-2">
            {mode !== "commands" ? (
              <Section title={trimmed ? "Results" : "Recents"}>
                {entities.length === 0 ? (
                  <Empty text={empty} />
                ) : (
                  entities.map((entity) => (
                    <Row
                      key={entity.id}
                      title={entity.title || "Untitled"}
                      subtitle={entity.key}
                      icon={<EntityIcon type={entity.type} icon={entity.icon} />}
                      onPress={() => openEntity(entity)}
                    />
                  ))
                )}
              </Section>
            ) : null}
            {commands.length > 0 ? (
              <Section title="Commands">
                {commands.map((command) => (
                  <Row
                    key={command.id}
                    title={command.title}
                    subtitle={shortcutOf(command)}
                    onPress={() => run(command)}
                  />
                ))}
              </Section>
            ) : mode === "commands" ? (
              <Empty text="No command matches." />
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </View>
  );
}
