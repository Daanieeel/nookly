import { IconFolder } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import type { CSSProperties, RefObject } from "react";
import { z } from "zod";
import type { ActionStatus } from "#/components/action-feedback.tsx";
import { renderIconValue } from "#/components/entity-icon.tsx";
import { FormField, fieldMessage } from "#/components/form-field.tsx";
import { IconPicker } from "#/components/icon-picker.tsx";
import { SubmitDialogFooter } from "#/components/submit-dialog-footer.tsx";
import { ACCENT_COLORS } from "#/lib/colors.ts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@nookly/ui/components/dialog";
import { Input } from "@nookly/ui/components/input";

const spaceSchema = z.object({
  name: z.string().trim().min(1, "Give the space a name"),
  color: z.string(),
  icon: z.string().nullable(),
});
export type SpaceValues = z.infer<typeof spaceSchema>;

/// The form behind the new Space and Space settings dialogs.
export function useSpaceForm(defaultValues: SpaceValues, onSubmit: (value: SpaceValues) => void) {
  return useForm({
    defaultValues,
    validators: { onChange: spaceSchema },
    onSubmit: ({ value }) => onSubmit(value),
  });
}

/// The shared look of the new Space and Space settings dialogs: icon, name and color
/// fields with a submit footer. Only the title, field ids and button labels differ.
export function SpaceFormDialog({
  open,
  onOpenChange,
  title,
  form,
  nameId,
  nameInputRef,
  status,
  label,
  successLabel,
  errorLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  form: ReturnType<typeof useSpaceForm>;
  nameId: string;
  nameInputRef: RefObject<HTMLInputElement | null>;
  status: ActionStatus;
  label: string;
  successLabel: string;
  errorLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[auto_1fr] items-start gap-3">
          <form.Field name="icon">
            {(iconField) => (
              <form.Subscribe selector={(state) => state.values.color}>
                {(color) => (
                  <SpaceIconField
                    icon={iconField.state.value}
                    color={color}
                    onChange={iconField.handleChange}
                  />
                )}
              </form.Subscribe>
            )}
          </form.Field>
          <form.Field name="name">
            {(field) => (
              <FormField label="Name" required htmlFor={nameId} error={fieldMessage(field)}>
                <Input
                  id={nameId}
                  ref={nameInputRef}
                  placeholder="e.g. University"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </FormField>
            )}
          </form.Field>
        </div>
        <form.Field name="color">
          {(field) => (
            <SpaceColorField
              colors={ACCENT_COLORS}
              value={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <SubmitDialogFooter
          form={form}
          status={status}
          label={label}
          successLabel={successLabel}
          errorLabel={errorLabel}
        />
      </DialogContent>
    </Dialog>
  );
}

/// The Space icon picker, tinted with the Space's current color.
export function SpaceIconField({
  icon,
  color,
  onChange,
}: {
  icon: string | null;
  color: string;
  onChange: (icon: string | null) => void;
}) {
  return (
    <FormField label="Icon">
      <IconPicker
        value={icon}
        onChange={onChange}
        trigger={
          <button
            type="button"
            aria-label="Choose Space icon"
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input bg-accent text-base hover:bg-accent/80"
          >
            <span
              className="text-(--space-color)"
              // SAFETY: `--space-color` only ever receives `color`, a plain hex string —
              // `CSSProperties` just doesn't model custom properties.
              style={{ "--space-color": color } as CSSProperties}
            >
              {icon ? renderIconValue(icon, 15) : <IconFolder size={15} />}
            </span>
          </button>
        }
      />
    </FormField>
  );
}

/// The row of color swatches for a Space.
export function SpaceColorField({
  colors,
  value,
  onChange,
}: {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <FormField label="Color">
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Space color ${c}`}
            onClick={() => onChange(c)}
            className={`size-6 rounded-full bg-(--swatch-color) ${value === c ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""}`}
            // SAFETY: `--swatch-color` only ever receives `c`, a plain hex string from
            // `SPACE_COLORS` — `CSSProperties` just doesn't model custom properties.
            style={{ "--swatch-color": c } as CSSProperties}
          />
        ))}
      </div>
    </FormField>
  );
}
