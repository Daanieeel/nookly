import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRaised, useScheme, useSemantic } from "./kit/scheme.ts";
import { useRevealWhileTyping } from "./Screen.tsx";
import { CORNER, FACE, PRIMARY, RADIUS, SPACE, TINT, elevation, focusDepth } from "./tokens.ts";
import { MIN_TOUCH } from "./touch.ts";

/// A one time code: one box per digit, typed, pasted or suggested by the system's keyboard
/// (the code from a message or an authenticator). It is the desktop's `OtpCodeInput`: raised
/// boxes in two groups, the next box lit while the keyboard is up, every box red when the code
/// was wrong. One plain field sits invisibly over them and takes the typing, so the boxes are
/// only drawing: a screen reader meets one field named `label`.
export function OtpField({
  label,
  length = 6,
  value,
  invalid = false,
  editable = true,
  onChange,
  onComplete,
}: {
  label: string;
  length?: number;
  value: string;
  invalid?: boolean;
  editable?: boolean;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
}) {
  const text = useSemantic("label");
  const controlEdge = useSemantic("controlEdge");
  const raised = useRaised();
  const scheme = useScheme();
  const [focused, setFocused] = useState(false);
  const field = useRef<TextInput>(null);
  const anchor = useRef<View>(null);
  const height = useRef(0);
  useRevealWhileTyping(anchor, focused, () => height.current);
  const lit = Math.min(value.length, length - 1);
  const half = Math.ceil(length / 2);
  const box = (index: number) => {
    const active = focused && index === lit && editable;
    const ring = invalid ? TINT.red[scheme] : PRIMARY;
    return (
      <View
        key={index}
        testID={`otp-box-${index}`}
        style={[
          CORNER,
          {
            flex: 1,
            maxWidth: 52,
            height: MIN_TOUCH + 12,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: RADIUS.control,
            borderWidth: 1,
            borderColor: invalid || active ? ring : controlEdge,
            backgroundColor: raised,
          },
          // The desktop's focus ring on the box the next digit goes in.
          active || invalid ? focusDepth(ring, scheme) : elevation("control", scheme),
        ]}
      >
        <Text style={{ fontFamily: FACE["500"], fontSize: 22, color: text }}>{value[index]}</Text>
        {active && value.length < length ? (
          <View style={{ position: "absolute", width: 1.5, height: 24, backgroundColor: text }} />
        ) : null}
      </View>
    );
  };
  const group = (from: number, to: number) => (
    <View
      key={from}
      style={{ flex: 1, flexDirection: "row", gap: SPACE.sm, justifyContent: "center" }}
    >
      {Array.from({ length: to - from }, (_, offset) => box(from + offset))}
    </View>
  );
  return (
    <Pressable
      ref={anchor}
      accessible={false}
      onLayout={(event) => {
        height.current = event.nativeEvent.layout.height;
      }}
      onPress={() => field.current?.focus()}
      style={{ opacity: editable ? 1 : 0.5 }}
    >
      <View style={{ flexDirection: "row", gap: SPACE.lg, justifyContent: "center" }}>
        {group(0, half)}
        {group(half, length)}
      </View>
      <TextInput
        ref={field}
        accessibilityLabel={label}
        aria-invalid={invalid}
        value={value}
        editable={editable}
        maxLength={length}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoCorrect={false}
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={(typed) => {
          const digits = typed.replace(/\D/g, "").slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        // Over the boxes and unseen: a tap lands on it, and the keyboard types into it.
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity: 0.02 }}
      />
    </Pressable>
  );
}
