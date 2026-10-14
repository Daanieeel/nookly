import { useEffect, useState } from "react";
import { z } from "zod";
import { Field } from "./Field.tsx";

/// A text property that saves when typing ends, like the desktop's inline properties.
/// Blank clears it.
export function TextProperty({
  label,
  value,
  onSave,
  readOnly = false,
  placeholder,
}: {
  label: string;
  value: string | null;
  onSave: (value: string | null) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  return (
    <Field
      label={label}
      value={text}
      editable={!readOnly}
      placeholder={placeholder}
      onChangeText={setText}
      onEndEditing={() => {
        const next = text.trim() || null;
        if (next !== value) onSave(next);
      }}
    />
  );
}

/// "", or a number written with a dot or a comma.
const numberText = z.union([
  z.literal("").transform(() => null),
  z
    .string()
    .transform((t) => Number(t.replace(",", ".")))
    .pipe(z.number().finite().min(0)),
]);

/// A number property (a grade, a weight), saved when typing ends. Blank clears it.
export function NumberProperty({
  label,
  value,
  onSave,
  readOnly = false,
  placeholder,
}: {
  label: string;
  value: number | null;
  onSave: (value: number | null) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  const parsed = numberText.safeParse(text.trim());
  return (
    <Field
      label={label}
      value={text}
      editable={!readOnly}
      placeholder={placeholder}
      keyboardType="decimal-pad"
      onChangeText={setText}
      error={parsed.success ? undefined : "Enter a number, like 1.7"}
      onEndEditing={() => parsed.success && parsed.data !== value && onSave(parsed.data)}
    />
  );
}
