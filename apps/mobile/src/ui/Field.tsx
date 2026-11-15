import { type ReactNode, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { FormRow, useInForm } from "./kit/Form.tsx";
import { Label } from "./kit/Label.tsx";
import { useScheme, useSemantic, useSurface } from "./kit/scheme.ts";
import { useRevealWhileTyping } from "./Screen.tsx";
import { useSectionRadius } from "./sheet/in-sheet.ts";
import { CORNER, DEPTH, FACE, GUTTER, SPACE, TINT, TYPE } from "./tokens.ts";
import { MIN_TOUCH } from "./touch.ts";

/// A field's name above what it holds, for the few places that lay a control out on their
/// own (a list of labels to tick).
export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <View style={{ paddingHorizontal: GUTTER, paddingBottom: SPACE.xs }}>
      <Label type="footnote" color="secondaryLabel">
        {label.toUpperCase()}
        {required ? " *" : ""}
      </Label>
    </View>
  );
}

/// Text typed into a form. On its own it is a raised box with a hairline edge, as the
/// desktop's input, its name small above it; focused, the edge and the name take the accent,
/// and an error turns the edge red with the message under it. As a row of a `FormSection` it
/// is an iOS form row with its name above the text. Either way an icon may stand for the
/// name, and a tap anywhere on it puts the cursor in it.
export function Field({
  label,
  required,
  error,
  multiline,
  icon,
  className: _className,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  /// Stands for the name at the start of the row; the name is still read out.
  icon?: ReactNode;
}) {
  const text = useSemantic("label");
  const muted = useSemantic("placeholder");
  const edge = useSemantic("separator");
  const surface = useSurface();
  const scheme = useScheme();
  const radius = useSectionRadius();
  const inForm = useInForm();
  const [focused, setFocused] = useState(false);
  const field = useRef<TextInput>(null);
  // What the page keeps above the keyboard while typing: the whole field, its name too.
  const box = useRef<View>(null);
  const boxHeight = useRef(0);
  useRevealWhileTyping(box, focused, () => boxHeight.current);
  const measured = (event: LayoutChangeEvent) => {
    boxHeight.current = event.nativeEvent.layout.height;
  };
  const accent = TINT.blue[scheme];
  const name = icon ? null : (
    <Label
      type="footnote"
      weight="500"
      color="secondaryLabel"
      tint={focused ? accent : undefined}
      style={inForm ? undefined : { paddingHorizontal: SPACE.xs }}
    >
      {label}
      {required ? " *" : ""}
    </Label>
  );
  const input = (
    <TextInput
      ref={field}
      accessibilityLabel={label}
      multiline={multiline}
      placeholderTextColor={muted}
      {...props}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        {
          flex: inForm ? undefined : 1,
          minHeight: multiline ? 88 : icon || !inForm ? MIN_TOUCH : 26,
          fontFamily: FACE["400"],
          fontSize: TYPE.body.fontSize,
          lineHeight: multiline ? TYPE.body.lineHeight : undefined,
          color: text,
          paddingVertical: multiline ? SPACE.sm : 0,
        },
        style,
      ]}
      textAlignVertical={multiline ? "top" : "center"}
    />
  );
  if (inForm) {
    return (
      <FormRow error={error}>
        <Pressable
          ref={box}
          testID={`field-${label}`}
          onLayout={measured}
          accessible={false}
          onPress={() => field.current?.focus()}
          style={{
            flexDirection: "row",
            alignItems: multiline ? "flex-start" : "center",
            gap: SPACE.md,
            paddingHorizontal: GUTTER,
            paddingVertical: icon ? 0 : SPACE.sm,
            minHeight: MIN_TOUCH + 12,
          }}
        >
          {icon ? <View style={{ paddingTop: multiline ? SPACE.md : 0 }}>{icon}</View> : null}
          <View style={{ flex: 1, flexDirection: "column", gap: SPACE.xxs }}>
            {name}
            {input}
          </View>
        </Pressable>
      </FormRow>
    );
  }
  const border = error ? TINT.red[scheme] : focused ? accent : edge;
  return (
    <Pressable
      ref={box}
      testID={`field-${label}`}
      onLayout={measured}
      accessible={false}
      onPress={() => field.current?.focus()}
      style={{ flexDirection: "column", gap: SPACE.xs + 2 }}
    >
      {name}
      <View
        testID="field-box"
        style={[
          CORNER,
          DEPTH.raised,
          {
            flexDirection: "row",
            alignItems: multiline ? "flex-start" : "center",
            gap: SPACE.md,
            paddingHorizontal: SPACE.md + 2,
            minHeight: MIN_TOUCH + 6,
            borderRadius: radius,
            borderWidth: focused || error ? 1.5 : 1,
            borderColor: border,
            backgroundColor: surface,
          },
          // The desktop's focus ring, as a soft glow of the accent.
          focused && !error
            ? {
                shadowColor: accent,
                shadowOpacity: 0.35,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 0 },
              }
            : null,
        ]}
      >
        {icon ? <View style={{ paddingTop: multiline ? SPACE.md : 0 }}>{icon}</View> : null}
        {input}
      </View>
      {error ? (
        <Label
          type="footnote"
          tint={TINT.red[scheme]}
          accessibilityLiveRegion="polite"
          style={{ paddingHorizontal: SPACE.xs }}
        >
          {error}
        </Label>
      ) : null}
    </Pressable>
  );
}
