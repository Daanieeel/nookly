import { IconSearch, IconX } from "@tabler/icons-react-native";
import { Pressable, TextInput, View } from "react-native";
import { CORNER, FACE, RADIUS, SPACE, TYPE } from "../tokens.ts";
import { MIN_TOUCH, touchSlop } from "../touch.ts";
import { Glyph } from "./Glyph.tsx";
import { useSemantic, useSemanticPair } from "./scheme.ts";

/// Linear's search pill: a finger tall, fully round.
const HEIGHT = 44;

/// Linear's search field: a filled pill with a magnifier, and a clear button once
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
  const muted = useSemanticPair("secondaryLabel");
  const text = useSemantic("label");
  return (
    <View
      style={[
        CORNER,
        {
          minHeight: HEIGHT,
          borderRadius: RADIUS.pill,
          backgroundColor: fill,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: SPACE.md,
          gap: SPACE.sm,
        },
      ]}
    >
      <Glyph icon={IconSearch} size={20} color={muted.hex} />
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
          paddingVertical: SPACE.xs,
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
            { paddingHorizontal: SPACE.sm, height: "100%", justifyContent: "center" },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Glyph icon={IconX} size={16} color={muted.hex} />
        </Pressable>
      ) : null}
    </View>
  );
}
