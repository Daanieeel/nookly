import type { AnyFieldApi } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { z } from "zod";
import { FieldError } from "#/components/action-feedback.tsx";
import { FieldLabel } from "@nookly/ui/components/field-label";
import { cn } from "@nookly/ui/lib/utils";

const errorSchema = z.union([
  z.string(),
  z.object({ message: z.string() }).transform((e) => e.message),
]);

/// The first validation message of a TanStack field, once the user has touched it or
/// tried to submit (submitting touches every field). `undefined` until then.
export function fieldMessage(field: AnyFieldApi): string | undefined {
  if (!field.state.meta.isTouched) return undefined;
  const first = errorSchema.safeParse(field.state.meta.errors[0]);
  return first.success ? first.data : undefined;
}

/// A form control with a small label above it and its error below. Pass the field's
/// `error` (see `fieldMessage`) to outline the control in red and say what is missing. Custom triggers opt in with `data-field-control`.
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  /// The id of the control, so the label focuses it.
  htmlFor?: string;
  error?: string | false | null;
  /// A quiet note under the control while there is no error.
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-invalid={error ? "true" : undefined}
      className={cn(
        "group/field flex min-w-0 flex-col gap-1",
        "data-[invalid=true]:[&_input]:border-destructive data-[invalid=true]:**:[[role=combobox]]:border-destructive data-[invalid=true]:**:data-field-control:border-destructive",
        className,
      )}
    >
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {error ? (
        <FieldError message={error} />
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
