import { ACCENT_COLORS } from "@nookly/shared/colors";
import { setEntityIcon, updateSpace } from "@nookly/shared/data";
import { ICON_LIBRARY_NAMES, iconLibraryValue, isIconLibraryValue } from "@nookly/shared/icons";
import {
  IconApple,
  IconBallFootball,
  IconBox,
  IconFlag,
  IconMathSymbols,
  IconMoodSmile,
  IconPaw,
  IconPlane,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react-native";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import emojiGroups from "unicode-emoji-json/data-by-group.json";
import { useLocalWrite } from "../data/context.tsx";
import { useEntity, useSpaces } from "../data/queries.ts";
import { ICON_LIBRARY } from "../ui/icons.tsx";
import { ColorChoices } from "../ui/kit/ColorChoices.tsx";
import { IconGrid } from "../ui/kit/IconGrid.tsx";
import { SearchField } from "../ui/kit/SearchField.tsx";
import { EmptyState, ErrorState } from "../ui/kit/States.tsx";
import { Surface } from "../ui/kit/Surface.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Segmented } from "../ui/Segmented.tsx";
import { SheetPinned } from "../ui/sheet/Sheet.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { CORNER, RADIUS, SPACE } from "../ui/tokens.ts";
import type { GlyphIcon } from "../ui/kit/Glyph.tsx";
import { useSemantic } from "../ui/kit/scheme.ts";
import { MIN_TOUCH } from "../ui/touch.ts";
import { useTheme } from "../ui/theme.ts";

/// Emoji in their groups, as the keyboard lists them, each with the desktop's icon for it.
const GROUP_ICONS = {
  smileys_emotion: IconMoodSmile,
  people_body: IconUsers,
  animals_nature: IconPaw,
  food_drink: IconApple,
  travel_places: IconPlane,
  activities: IconBallFootball,
  objects: IconBox,
  symbols: IconMathSymbols,
  flags: IconFlag,
} satisfies { [slug: string]: GlyphIcon };
function isGroupSlug(slug: string): slug is keyof typeof GROUP_ICONS {
  return slug in GROUP_ICONS;
}
const GROUPS = emojiGroups.map((group) => ({
  slug: group.slug,
  name: group.name,
  emojis: group.emojis,
  icon: isGroupSlug(group.slug) ? GROUP_ICONS[group.slug] : IconBox,
}));
const EMOJI = GROUPS.flatMap((group) => group.emojis);
/// How many emoji a search shows at most.
const EMOJI_SHOWN = 320;

/// Chooses the icon of an item or a Space: one from the icon library (tinted if wanted)
/// or an emoji, as on the desktop. Opens as a sheet from the item's or Space's screen: the
/// kind of icon and a search pinned at the top, the choices in grids on raised surfaces.
export function IconPickerScreen() {
  const close = useCloseSheet();
  const theme = useTheme();
  const { kind, id, only } = useLocalSearchParams<{
    kind: "entity" | "space";
    id: string;
    /// `emoji`: the emoji alone, without the choice of kind (a Space's settings show the
    /// icons themselves).
    only?: "emoji";
  }>();
  const { data: entity } = useEntity(kind === "entity" ? id : "");
  const { data: spaces = [] } = useSpaces();
  const current = kind === "space" ? spaces.find((s) => s.id === id)?.icon : entity?.icon;
  const [tab, setTab] = useState<"icons" | "emoji">(
    only === "emoji" || (current && !isIconLibraryValue(current)) ? "emoji" : "icons",
  );
  const [color, setColor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(0);
  const save = useLocalWrite(async (db, icon: string) => {
    if (kind === "space") await updateSpace(db, id, { icon });
    else await setEntityIcon(db, id, icon);
  });
  const pick = (icon: string) => save.mutate(icon, { onSuccess: () => close() });
  const words = query.trim().toLowerCase();
  const icons = ICON_LIBRARY_NAMES.filter((name) => name.toLowerCase().includes(words));
  const emojiSections = useMemo(() => {
    if (words) {
      const found = EMOJI.filter((e) => e.name.toLowerCase().includes(words));
      return found.length > 0 ? [{ name: "Results", emojis: found.slice(0, EMOJI_SHOWN) }] : [];
    }
    // One group at a time, all of it, as on the desktop.
    const shown = GROUPS[group] ?? GROUPS[0];
    return [{ name: shown.name, emojis: shown.emojis }];
  }, [words, group]);
  const empty = tab === "icons" ? icons.length === 0 : emojiSections.length === 0;
  return (
    <Screen>
      <SheetPinned>
        <View style={{ gap: SPACE.sm }}>
          {only === "emoji" ? null : (
            <Segmented
              label="Kind of icon"
              value={tab}
              options={[
                { value: "icons", label: "Icons" },
                { value: "emoji", label: "Emoji" },
              ]}
              onChange={(next) => {
                setTab(next);
                setQuery("");
              }}
            />
          )}
          <SearchField
            label={tab === "icons" ? "Search icons" : "Search emoji"}
            value={query}
            onChangeText={setQuery}
          />
          {tab === "emoji" && !words ? <EmojiGroups value={group} onChange={setGroup} /> : null}
        </View>
      </SheetPinned>
      {tab === "icons" ? (
        <View style={{ gap: SPACE.sm }}>
          <Surface title="Tint" padding={SPACE.xs}>
            <ColorChoices
              label="Tint"
              colors={ACCENT_COLORS}
              value={color}
              onChange={setColor}
              none="No tint"
            />
          </Surface>
          {icons.length > 0 ? (
            <Surface title="Icons">
              <IconGrid
                cells={icons.map((name) => {
                  const Glyph = ICON_LIBRARY[name];
                  return {
                    key: name,
                    label: name,
                    selected: current === iconLibraryValue(name, color),
                    onPress: () => pick(iconLibraryValue(name, color)),
                    content: <Glyph size={26} color={color ?? theme.colors.foreground} />,
                  };
                })}
              />
            </Surface>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: SPACE.sm }}>
          {emojiSections.map((section) => (
            <Surface key={section.name} title={section.name}>
              <IconGrid
                cells={section.emojis.map((e) => ({
                  key: e.emoji,
                  label: e.name,
                  selected: current === e.emoji,
                  onPress: () => pick(e.emoji),
                  content: <Text style={{ fontSize: 28 }}>{e.emoji}</Text>,
                }))}
              />
            </Surface>
          ))}
        </View>
      )}
      {empty ? (
        <EmptyState
          glyph={IconSearch}
          title="No Results"
          message="Check the spelling or try a new search."
        />
      ) : null}
      {save.error ? <ErrorState title="Couldn't Save" message={save.error.message} /> : null}
    </Screen>
  );
}

/// The emoji groups as the desktop's row of icons: a tap shows that group.
function EmojiGroups({ value, onChange }: { value: number; onChange: (index: number) => void }) {
  const fill = useSemantic("fill");
  const label = useSemantic("label");
  const muted = useSemantic("secondaryLabel");
  return (
    // All nine share the width, so every group is in sight without scrolling sideways.
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Emoji groups"
      style={{ flexDirection: "row" }}
    >
      {GROUPS.map((g, index) => {
        const selected = index === value;
        const Glyph = g.icon;
        return (
          <Pressable
            key={g.slug}
            accessibilityRole="tab"
            accessibilityLabel={g.name}
            accessibilityState={{ selected }}
            onPress={() => onChange(index)}
            style={({ pressed }) => [
              CORNER,
              {
                flex: 1,
                height: MIN_TOUCH,
                borderRadius: RADIUS.control,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: selected ? fill : undefined,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Glyph size={22} color={selected ? label : muted} />
          </Pressable>
        );
      })}
    </View>
  );
}
