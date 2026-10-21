import { ACCENT_COLORS } from "@nookly/shared/colors";
import { setEntityIcon, updateSpace } from "@nookly/shared/data";
import { ICON_LIBRARY_NAMES, iconLibraryValue, isIconLibraryValue } from "@nookly/shared/icons";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import emojiGroups from "unicode-emoji-json/data-by-group.json";
import { useLocalWrite } from "../data/context.tsx";
import { useEntity, useSpaces } from "../data/queries.ts";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Field } from "../ui/Field.tsx";
import { ICON_LIBRARY } from "../ui/icons.tsx";
import { cn } from "../ui/classes.ts";
import { Screen } from "../ui/Screen.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { Swatch } from "../ui/Swatch.tsx";

const EMOJI = emojiGroups.flatMap((group) => group.emojis);
const COLUMNS = 7;

/// The cell a person taps: an icon or an emoji, marked when it is the current one.
function Cell({
  label,
  selected,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        "m-0.5 aspect-square flex-1 items-center justify-center rounded-lg active:bg-accent",
        selected && "bg-accent ring-1 ring-ring",
      )}
    >
      {children}
    </Pressable>
  );
}

/// Chooses the icon of an item or a Space: one from the icon library (tinted if wanted)
/// or an emoji, as on the desktop. Opens as a sheet from the item's or Space's screen.
export function IconPickerScreen() {
  const close = useCloseSheet();
  const theme = useTheme();
  const { kind, id } = useLocalSearchParams<{ kind: "entity" | "space"; id: string }>();
  const { data: entity } = useEntity(kind === "entity" ? id : "");
  const { data: spaces = [] } = useSpaces();
  const current = kind === "space" ? spaces.find((s) => s.id === id)?.icon : entity?.icon;
  const [tab, setTab] = useState<"icons" | "emoji">(
    current && !isIconLibraryValue(current) ? "emoji" : "icons",
  );
  const [color, setColor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const save = useLocalWrite(async (db, icon: string) => {
    if (kind === "space") await updateSpace(db, id, { icon });
    else await setEntityIcon(db, id, icon);
  });
  const pick = (icon: string) => save.mutate(icon, { onSuccess: () => close() });
  const emoji = useMemo(() => {
    const words = query.trim().toLowerCase();
    return words ? EMOJI.filter((e) => e.name.toLowerCase().includes(words)) : EMOJI;
  }, [query]);
  return (
    <Screen>
      <ChipGroup label="Kind of icon">
        <Chip label="Icons" selected={tab === "icons"} onPress={() => setTab("icons")} />
        <Chip label="Emoji" selected={tab === "emoji"} onPress={() => setTab("emoji")} />
      </ChipGroup>
      {tab === "icons" ? (
        <View className="gap-4">
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Tint"
            className="-mx-2 flex-row flex-wrap"
          >
            <Swatch
              label="No tint"
              color={null}
              selected={color === null}
              onPress={() => setColor(null)}
              className="size-7 rounded-full"
              selectedClassName="ring-2 ring-ring"
            />
            {ACCENT_COLORS.map((c) => (
              <Swatch
                key={c}
                label={`Tint ${c}`}
                color={c}
                selected={c === color}
                onPress={() => setColor(c)}
                className="size-7 rounded-full"
                selectedClassName="ring-2 ring-ring"
              />
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {ICON_LIBRARY_NAMES.map((name) => {
              const Glyph = ICON_LIBRARY[name];
              return (
                <View key={name} style={{ width: `${100 / COLUMNS}%` }} className="flex-row">
                  <Cell
                    label={name}
                    selected={current === iconLibraryValue(name, color)}
                    onPress={() => pick(iconLibraryValue(name, color))}
                  >
                    <Glyph size={24} color={color ?? theme.colors.foreground} />
                  </Cell>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View className="gap-3">
          <Field
            label="Search emoji"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Search emoji"
          />
          {emoji.length === 0 ? (
            <Text tone="muted" className="py-6 text-center">
              No emoji found
            </Text>
          ) : (
            <FlatList
              data={emoji.slice(0, 280)}
              numColumns={COLUMNS}
              scrollEnabled={false}
              keyExtractor={(e) => e.emoji}
              renderItem={({ item }) => (
                <Cell
                  label={item.name}
                  selected={current === item.emoji}
                  onPress={() => pick(item.emoji)}
                >
                  <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
                </Cell>
              )}
            />
          )}
        </View>
      )}
      {save.error ? <Text tone="destructive">{save.error.message}</Text> : null}
    </Screen>
  );
}
