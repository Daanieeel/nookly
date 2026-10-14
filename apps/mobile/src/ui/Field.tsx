import {
  FIELD_ERROR_CLASSES,
  FORM_FIELD_CLASSES,
  REQUIRED_MARK_CLASSES,
} from "@nookly/frontend/classes";
import { FIELD_LABEL_CLASSES, INPUT_CLASSES, TEXTAREA_CLASSES } from "@nookly/ui/classes";
import { IconAlertTriangle } from "@tabler/icons-react-native";
import { TextInput, type TextInputProps, View } from "react-native";
import { cn, row, splitText } from "./classes.ts";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// The desktop's `FieldError`: a warning icon and what is wrong.
function FieldError({ message }: { message: string | null | undefined }) {
  const theme = useTheme();
  if (!message) return null;
  const { box, text } = splitText(row(FIELD_ERROR_CLASSES));
  return (
    <View className={box} accessibilityLiveRegion="polite">
      <IconAlertTriangle size={12} color={theme.colors.destructive} />
      <Text className={text}>{message}</Text>
    </View>
  );
}

/// The desktop's `FieldLabel`, with the red star of a required field.
export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const { box, text } = splitText(row(FIELD_LABEL_CLASSES));
  return (
    <View className={box}>
      <Text className={text}>{label}</Text>
      {required ? (
        <Text className={cn(text, REQUIRED_MARK_CLASSES)} accessibilityLabel="required">
          *
        </Text>
      ) : null}
    </View>
  );
}

/// The desktop's `FormField` around its `Input` (or `Textarea` when multiline): the
/// label above, the error below, the control outlined in red while there is one.
export function Field({
  label,
  required,
  error,
  multiline,
  className,
  ...props
}: TextInputProps & { label: string; required?: boolean; error?: string; className?: string }) {
  return (
    <View className={FORM_FIELD_CLASSES}>
      <FieldLabel label={label} required={required} />
      <TextInput
        accessibilityLabel={label}
        multiline={multiline}
        {...props}
        className={cn(
          multiline ? TEXTAREA_CLASSES : INPUT_CLASSES,
          "font-sans text-foreground",
          multiline ? "min-h-24" : "h-10",
          error && "border-destructive",
          className,
        )}
        textAlignVertical={multiline ? "top" : "center"}
      />
      <FieldError message={error} />
    </View>
  );
}
