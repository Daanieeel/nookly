import { IconSearch, IconX } from "@tabler/icons-react-native";
import { Pressable, TextInput, View } from "react-native";
import { CORNER, FACE, RADIUS, SPACE, TYPE } from "../tokens.ts";
import { MIN_TOUCH, touchSlop } from "../touch.ts";
import { Glyph } from "./Glyph.tsx";
import { useSemantic, useSemanticPair } from "./scheme.ts";

/// Roomier than a finger: the bar people type into first on a page.
export const SEARCH_HEIGHT = 50;
const HEIGHT = SEARCH_HEIGHT;

/// Linear's search field: a filled squircle with a magnifier, and a clear button once
/// something is typed. Sits pinned above the list it searches.
export function SearchField({
  label,
  value,
  onChangeText,
  placeholder = "Search",
  onSubmit,
  autoFocus,
}: {
  /// Read out: "Search Status".
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const fill = useSemantic("fill");
  // Solid, never see through: a translucent grey shows the magnifier's circle through its
  // handle where the two strokes cross.
  const muted = useSemanticPair("secondaryLabelSolid");
  const text = useSemantic("label");
  return (
    <View
      testID="search-field"
      style={[
        CORNER,
        {
          minHeight: HEIGHT,
          borderRadius: RADIUS.control,
          backgroundColor: fill,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: SPACE.md,
          gap: SPACE.sm,
        },
      ]}
    >
      <IconSearch testID="search-icon" size={20} color={muted.hex} />
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={muted.color}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        returnKeyType={onSubmit ? "done" : "search"}
        onSubmitEditing={onSubmit}
        clearButtonMode="never"
        hitSlop={touchSlop(HEIGHT, MIN_TOUCH)}
        maxFontSizeMultiplier={2}
        style={{
          flex: 1,
          minHeight: HEIGHT,
          paddingVertical: 0,
          fontFamily: FACE["400"],
          fontSize: TYPE.body.fontSize,
          color: text,
        }}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear Search"
          onPress={() => onChangeText("")}
          hitSlop={touchSlop(HEIGHT, MIN_TOUCH)}
          style={({ pressed }) => [
            { paddingHorizontal: SPACE.sm, alignSelf: "stretch", justifyContent: "center" },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Glyph icon={IconX} size={16} color={muted.hex} />
        </Pressable>
      ) : null}
    </View>
  );
}
