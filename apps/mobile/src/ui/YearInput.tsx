import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { useTheme } from "./theme.ts";
import { useSemantic } from "./kit/scheme.ts";
import { FACE } from "./tokens.ts";

const FIRST = 1900;
const LAST = 2200;

/// A year typed on the number pad, in the large digits of the time input's clock face, with a
/// line under them as if writing into it. A year counts once its four digits are in range;
/// left unfinished, it goes back to the one it has.
export function YearInput({
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: number;
  onChange: (year: number) => void;
  autoFocus?: boolean;
}) {
  const primary = useTheme().colors.primary;
  const text = useSemantic("label");
  const placeholder = useSemantic("placeholder");
  const [typed, setTyped] = useState(String(value));
  useEffect(() => setTyped(String(value)), [value]);
  return (
    <View style={{ alignItems: "center", alignSelf: "center" }}>
      <TextInput
        accessibilityLabel={label}
        value={typed}
        onChangeText={(next) => {
          const digits = next.replace(/\D/g, "").slice(0, 4);
          setTyped(digits);
          const year = Number(digits);
          if (digits.length === 4 && year >= FIRST && year <= LAST && year !== value) {
            onChange(year);
          }
        }}
        onEndEditing={() => setTyped(String(value))}
        keyboardType="number-pad"
        selectTextOnFocus
        autoFocus={autoFocus}
        maxLength={4}
        placeholder="----"
        placeholderTextColor={placeholder}
        style={{
          width: 180,
          height: 72,
          textAlign: "center",
          fontFamily: FACE["500"],
          fontSize: 60,
          fontVariant: ["tabular-nums"],
          color: text,
          padding: 0,
        }}
      />
      <View
        testID={`${label}, underline`}
        style={{ width: 168, height: 2, borderRadius: 1, backgroundColor: primary }}
      />
    </View>
  );
}
