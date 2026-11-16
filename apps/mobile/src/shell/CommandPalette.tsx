import type { EntityRecord } from "@nookly/shared/data";
import { lineInput } from "../ui/kit/line-input.ts";
import { INPUT_CLASSES } from "@nookly/ui/classes";
import { IconSearch } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useRecents, useSearch } from "../data/queries.ts";
import { cn, splitText, row } from "../ui/classes.ts";
import { EntityIcon } from "../ui/icons.tsx";
import { useWindowSize } from "../ui/pane.tsx";
import { Empty, Section } from "../ui/Row.tsx";
import { pushLayer } from "../ui/sheet/layers.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { MIN_TOUCH } from "../ui/touch.ts";
import { COMMANDS, type PaletteCommand, filterCommands } from "./commands.ts";
import { type Shortcut, SHORTCUTS, shortcutLabel } from "./shortcuts.ts";
import { type PaletteMode, useShell } from "./store.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

const PLACEHOLDER = {
  search: "Search",
  quick: "Go to",
  commands: "Command",
} satisfies Record<PaletteMode, string>;

function shortcutOf(command: PaletteCommand): string | null {
  const shortcut = SHORTCUTS.find((s: Shortcut) => s.id === command.shortcut);
  return shortcut ? shortcutLabel(shortcut) : null;
}

/// One row: an item with its key beside the title, or a command with its keys. The
/// selected one (arrow keys) shows as the desktop's highlighted row.
function PaletteRow({
  title,
  detail,
  icon,
  selected,
  onPress,
  rowRef,
}: {
  title: string;
  detail: string | null;
  icon?: ReactNode;
  selected: boolean;
  onPress: () => void;
  rowRef: RefObject<View | null>;
}) {
  return (
    <Pressable
      ref={selected ? rowRef : undefined}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH }}
      className={cn(
        "flex-row items-center gap-3 rounded-md px-3",
        selected ? "bg-accent" : "active:bg-accent/50",
      )}
    >
      {icon}
      <Text numberOfLines={1} className="min-w-0 flex-1">
        {title}
      </Text>
      {detail ? (
        <Text variant="small" tone="muted" className="font-mono">
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/// The desktop's Cmd+K, Cmd+P and Cmd+Shift+P in one place: a panel near the top of the
/// window that finds items and runs commands, the arrow keys moving through the rows and
/// Return opening the chosen one. `onAction` carries out what only the window knows how
/// to do (collapse the sidebar, go back).
export function CommandPalette({ onAction }: { onAction: (action: AppAction) => void }) {
  const mode = useShell((s) => s.palette);
  const close = useShell((s) => s.close);
  const router = useRouter();
  const theme = useTheme();
  const { width, height } = useWindowSize();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  // The rows there are, for the arrow keys, which the layer reads when pressed.
  const count = useRef(0);
  useEffect(() => {
    if (mode === null) setQuery("");
    setSelected(0);
  }, [mode]);
  // Keeps the selected row in sight as the arrows move it.
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const selectedRow = useRef<View>(null);
  const view = useRef({ offset: 0, height: 0 });
  useEffect(() => {
    const node = content.current;
    if (!node) return;
    selectedRow.current?.measureLayout(
      node,
      (_x, top, _w, rowHeight) => {
        const { offset, height: shown } = view.current;
        if (top + rowHeight > offset + shown)
          scroll.current?.scrollTo({ y: top + rowHeight - shown });
        else if (top < offset) scroll.current?.scrollTo({ y: top });
      },
      () => {},
    );
  }, [selected]);
  // While open it is the newest layer: Escape closes it, the arrows move its selection.
  useEffect(() => {
    if (mode === null) return;
    const layer = pushLayer(close, {
      move: (delta) => setSelected((i) => Math.min(Math.max(i + delta, 0), count.current - 1)),
    });
    return layer.remove;
  }, [mode, close]);
  const trimmed = query.trim();
  const { data: found = [] } = useSearch(mode === "commands" ? "" : trimmed);
  const { data: recent = [] } = useRecents();
  if (mode === null) return null;

  const entities: EntityRecord[] =
    mode === "commands" ? [] : trimmed ? found.slice(0, 12) : recent.slice(0, 8);
  const commands =
    mode === "quick" ? [] : filterCommands(COMMANDS, trimmed).slice(0, trimmed ? 8 : 20);
  count.current = entities.length + commands.length;
  const at = Math.min(selected, Math.max(count.current - 1, 0));

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
    const entity = entities.at(at);
    const command = commands.at(at - entities.length);
    if (at < entities.length && entity) openEntity(entity);
    else if (command) run(command);
  };
  const search = (text: string) => {
    setQuery(text);
    setSelected(0);
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
              onChangeText={search}
              onSubmitEditing={submit}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="go"
              className={cn(text, "flex-1 text-foreground")}
              style={lineInput("callout")}
            />
          </View>
          <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            onLayout={(e) => {
              view.current.height = e.nativeEvent.layout.height;
            }}
            onScroll={(e) => {
              view.current.offset = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
            <View ref={content} className="gap-3 p-2">
              {mode !== "commands" ? (
                <Section title={trimmed ? "Results" : "Recents"}>
                  {entities.length === 0 ? (
                    <Empty text={empty} />
                  ) : (
                    entities.map((entity, i) => (
                      <PaletteRow
                        key={entity.id}
                        title={entity.title || "Untitled"}
                        detail={entity.key}
                        icon={<EntityIcon type={entity.type} icon={entity.icon} size={16} />}
                        selected={i === at}
                        rowRef={selectedRow}
                        onPress={() => openEntity(entity)}
                      />
                    ))
                  )}
                </Section>
              ) : null}
              {mode === "search" && trimmed ? (
                <PaletteRow
                  title="Show All Results"
                  detail={null}
                  icon={<IconSearch size={16} color={theme.colors.mutedForeground} />}
                  selected={false}
                  rowRef={selectedRow}
                  onPress={() => {
                    close();
                    router.push({ pathname: "/search", params: { q: trimmed } });
                  }}
                />
              ) : null}
              {commands.length > 0 ? (
                <Section title="Commands">
                  {commands.map((command, i) => (
                    <PaletteRow
                      key={command.id}
                      title={command.title}
                      detail={shortcutOf(command)}
                      selected={entities.length + i === at}
                      rowRef={selectedRow}
                      onPress={() => run(command)}
                    />
                  ))}
                </Section>
              ) : mode === "commands" ? (
                <Empty text="No command matches." />
              ) : null}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </View>
  );
}
