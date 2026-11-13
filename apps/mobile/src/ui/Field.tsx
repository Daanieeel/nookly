import { type ReactNode, useRef } from "react";
import { Pressable, TextInput, type TextInputProps, View } from "react-native";
import { FormRow } from "./kit/Form.tsx";
import { Label } from "./kit/Label.tsx";
import { useSemantic } from "./kit/scheme.ts";
import { FACE, GUTTER, SPACE, TYPE } from "./tokens.ts";
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

/// Text typed into a form, as an iOS form row: its name small above the text, so the name
/// never passes for a placeholder, or an icon at the start in place of the name. A tap
/// anywhere on the row puts the cursor in it. Errors show under it in red.
export function Field({
  label,
  required,
  error,
  multiline,
  icon,
  className: _className,
  style,
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
  const muted = useSemantic("tertiaryLabel");
  const field = useRef<TextInput>(null);
  return (
    <FormRow error={error}>
      <Pressable
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
          {icon ? null : (
            <Label type="footnote" color="secondaryLabel">
              {label}
              {required ? " *" : ""}
            </Label>
          )}
          <TextInput
            ref={field}
            accessibilityLabel={label}
            multiline={multiline}
            placeholderTextColor={muted}
            {...props}
            style={[
              {
                minHeight: multiline ? 88 : icon ? MIN_TOUCH : 26,
                fontFamily: FACE["400"],
                fontSize: TYPE.body.fontSize,
                lineHeight: multiline ? TYPE.body.lineHeight : undefined,
                color: text,
                paddingVertical: multiline && icon ? SPACE.sm : 0,
              },
              style,
            ]}
            textAlignVertical={multiline ? "top" : "center"}
          />
        </View>
      </Pressable>
    </FormRow>
  );
}
