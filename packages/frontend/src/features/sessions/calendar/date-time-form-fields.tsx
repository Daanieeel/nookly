import type { FunctionComponent, ReactNode } from "react";
import { DateInput } from "#/components/date-input.tsx";
import { type FieldLike, FormField, fieldMessage } from "#/components/form-field.tsx";
import { TimeInput } from "#/components/time-input.tsx";
import { Checkbox } from "@nookly/ui/components/checkbox";
import { Label } from "@nookly/ui/components/label";

/// A form these fields only read by name: the Calendar and Session forms each
/// have their own value shape, but share `startTime` and `endTime`, and the
/// Calendar form also has `allDay`.
interface TimeFieldsForm {
  Field: FunctionComponent<{
    name: "startTime" | "endTime";
    children: (field: FieldLike) => ReactNode;
  }>;
}

interface AllDayFieldForm {
  Field: FunctionComponent<{
    name: "allDay";
    children: (field: FieldLike<boolean>) => ReactNode;
  }>;
}

/// The Calendar form's `Subscribe`, read for its `allDay` value.
interface AllDaySubscribe {
  Subscribe: FunctionComponent<{
    selector: (state: { values: { allDay: boolean } }) => boolean;
    children: (allDay: boolean) => ReactNode;
  }>;
}

/// A day field as the Calendar and Session forms draw it. It is required unless
/// `optional` (an end date), in which case it can also be cleared.
export function DateField({
  field,
  label,
  ariaLabel,
  placeholder,
  optional,
  className,
}: {
  field: FieldLike;
  label: string;
  ariaLabel: string;
  placeholder?: string;
  optional?: boolean;
  className?: string;
}) {
  return (
    <FormField label={label} required={!optional} error={fieldMessage(field)} className={className}>
      <DateInput
        aria-label={ariaLabel}
        clearable={Boolean(optional)}
        placeholder={placeholder}
        value={field.state.value || null}
        onChange={(day) => field.handleChange(day ?? "")}
      />
    </FormField>
  );
}

/// A start or end time field.
export function TimeField({
  field,
  label,
  ariaLabel,
  className,
}: {
  field: FieldLike;
  label: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <FormField label={label} required error={fieldMessage(field)}>
      <TimeInput
        aria-label={ariaLabel}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={field.handleChange}
        className={className}
      />
    </FormField>
  );
}

/// The Starts and Ends time fields, side by side in the parent's grid.
export function TimeRangeFields({
  form,
  inputClassName,
}: {
  form: TimeFieldsForm;
  inputClassName?: string;
}) {
  return (
    <>
      <form.Field name="startTime">
        {(field) => (
          <TimeField
            field={field}
            label="Starts"
            ariaLabel="Start time"
            className={inputClassName}
          />
        )}
      </form.Field>
      <form.Field name="endTime">
        {(field) => (
          <TimeField field={field} label="Ends" ariaLabel="End time" className={inputClassName} />
        )}
      </form.Field>
    </>
  );
}

/// The All day checkbox and, unless it is checked, the start and end time fields:
/// the time part of a Calendar entry form.
export function AllDayTimeFields({
  form,
  idPrefix,
}: {
  form: TimeFieldsForm & AllDayFieldForm & AllDaySubscribe;
  idPrefix: string;
}) {
  return (
    <>
      <form.Field name="allDay">
        {(field) => (
          <div className="col-span-2 flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-all-day`}
              checked={field.state.value}
              onCheckedChange={(v) => field.handleChange(v === true)}
            />
            <Label htmlFor={`${idPrefix}-all-day`} className="font-normal">
              All day
            </Label>
          </div>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.allDay}>
        {(allDay) =>
          !allDay && (
            <>
              <form.Field name="startTime">
                {(field) => <TimeField field={field} label="Start time" ariaLabel="Start time" />}
              </form.Field>
              <form.Field name="endTime">
                {(field) => <TimeField field={field} label="End time" ariaLabel="End time" />}
              </form.Field>
            </>
          )
        }
      </form.Subscribe>
    </>
  );
}
