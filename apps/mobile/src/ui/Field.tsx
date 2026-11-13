import { TextInput, type TextInputProps, View } from "react-native";
import { FormRow, RowLabel } from "./kit/Form.tsx";
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

/// Text typed into a form, as an iOS form row (D52): its name at the start and the text
/// beside it, or, for several lines, the name small above a taller box. Errors show under
/// it in red.
export function Field({
  label,
  required,
  error,
  multiline,
  className: _className,
  style,
  ...props
}: TextInputProps & { label: string; required?: boolean; error?: string; className?: string }) {
  const text = useSemantic("label");
  const muted = useSemantic("tertiaryLabel");
  const input = (
    <TextInput
      accessibilityLabel={label}
      multiline={multiline}
      placeholderTextColor={muted}
      {...props}
      style={[
        {
          flex: multiline ? undefined : 1,
          minHeight: multiline ? 88 : MIN_TOUCH,
          fontFamily: FACE["400"],
          fontSize: TYPE.body.fontSize,
          lineHeight: multiline ? TYPE.body.lineHeight : undefined,
          color: text,
          paddingVertical: multiline ? SPACE.xs : 0,
        },
        style,
      ]}
      textAlignVertical={multiline ? "top" : "center"}
    />
  );
  return (
    <FormRow error={error}>
      {multiline ? (
        <View style={{ paddingHorizontal: GUTTER, paddingTop: SPACE.sm, gap: SPACE.xxs }}>
          <Label type="footnote" color="secondaryLabel">
            {label}
            {required ? " *" : ""}
          </Label>
          {input}
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACE.md,
            paddingHorizontal: GUTTER,
            minHeight: MIN_TOUCH + 4,
          }}
        >
          <View style={{ maxWidth: "40%" }}>
            <RowLabel label={label} required={required} />
          </View>
          {input}
        </View>
      )}
    </FormRow>
  );
}
