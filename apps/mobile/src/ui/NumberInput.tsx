import { IconMinus, IconPlus } from "@tabler/icons-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { haptic } from "./haptics.ts";
import { useSemantic, useSemanticPair } from "./kit/scheme.ts";
import { FACE, RADIUS, TYPE } from "./tokens.ts";
import { MIN_TOUCH } from "./touch.ts";

/// The desktop's `NumberInput` at a finger's size: minus, the value (tap it to type one),
/// plus. Typing is kept as typed until it ends, so a number on its way to a valid one is
/// not snapped back; then it is held between `min` and `max`.
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  increments = step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  increments?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const fill = useSemantic("fill");
  const line = useSemantic("separator");
  const text = useSemantic("label");
  const muted = useSemanticPair("secondaryLabel");
  const clamp = (next: number) =>
    Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(next / step) * step));
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;
  const commit = () => {
    if (draft === null) return;
    const next = Number(draft.replace(",", "."));
    setDraft(null);
    if (draft.trim() !== "" && Number.isFinite(next)) onChange(clamp(next));
  };
  const button = (kind: "Decrease" | "Increase", disabled: boolean, by: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kind} ${label}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptic("select");
        setDraft(null);
        onChange(clamp(value + by));
      }}
      style={({ pressed }) => ({
        width: MIN_TOUCH,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : pressed ? 0.5 : 1,
      })}
    >
      {kind === "Decrease" ? (
        <IconMinus size={18} color={muted.hex} />
      ) : (
        <IconPlus size={18} color={muted.hex} />
      )}
    </Pressable>
  );
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        height: MIN_TOUCH,
        borderRadius: RADIUS.control,
        borderCurve: "continuous",
        backgroundColor: fill,
        overflow: "hidden",
      }}
    >
      {button("Decrease", atMin, -increments)}
      <TextInput
        accessibilityLabel={label}
        value={draft ?? String(value)}
        onChangeText={setDraft}
        onEndEditing={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        maxFontSizeMultiplier={1.5}
        style={{
          minWidth: 56,
          paddingHorizontal: 8,
          textAlign: "center",
          fontFamily: FACE["500"],
          fontSize: TYPE.body.fontSize,
          fontVariant: ["tabular-nums"],
          color: text,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: line,
        }}
      />
      {button("Increase", atMax, increments)}
    </View>
  );
}
