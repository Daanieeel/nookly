import type { AnyFieldApi } from "@tanstack/react-form";
import type { RefObject } from "react";
import { FormField, fieldMessage } from "#/components/form-field.tsx";
import { Input } from "@nookly/ui/components/input";

/// The required Name field of a create or rename dialog.
export function NameFormField({
  field,
  id,
  inputRef,
  placeholder,
  className,
}: {
  field: AnyFieldApi;
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  className?: string;
}) {
  return (
    <FormField label="Name" required htmlFor={id} error={fieldMessage(field)} className={className}>
      <Input
        id={id}
        ref={inputRef}
        placeholder={placeholder}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
      />
    </FormField>
  );
}
