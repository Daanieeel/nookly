import { TextInput, type TextInputProps, View } from "react-native";
import { Text } from "./Text.tsx";
import { FONT, useTheme } from "./theme.ts";

/// A labelled input like the desktop's `FormField`: a small label above, a red star
/// when required, the error right below. Styled like a secondary button, so it recedes.
export function Field({
  label,
  required,
  error,
  multiline,
  ...props
}: TextInputProps & { label: string; required?: boolean; error?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(1) }}>
      <Text variant="label" tone="muted">
        {label}
        {required ? (
          <Text variant="label" tone="destructive">
            {" "}
            *
          </Text>
        ) : null}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.mutedForeground}
        multiline={multiline}
        {...props}
        style={{
          minHeight: multiline ? 96 : 40,
          paddingHorizontal: theme.space(3),
          paddingVertical: multiline ? theme.space(2) : 0,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: error ? theme.colors.destructive : theme.colors.input,
          backgroundColor: theme.colors.secondary,
          color: theme.colors.foreground,
          fontFamily: FONT.regular,
          fontSize: theme.text.sm,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {error ? (
        <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
