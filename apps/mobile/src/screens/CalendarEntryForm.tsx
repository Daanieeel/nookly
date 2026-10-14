import type { CalendarEntryInput } from "@nookly/shared/data";
import { useForm } from "@tanstack/react-form";
import { Switch, View } from "react-native";
import { z } from "zod";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { fieldError } from "./forms.ts";

const time = z.union([
  z.literal(""),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use the form 14:30"),
]);
const schema = z
  .object({
    title: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the form 2026-10-31"),
    startTime: time,
    endTime: time,
    allDay: z.boolean(),
    location: z.string().max(200),
  })
  .refine((v) => v.allDay || v.endTime === "" || v.startTime === "" || v.endTime > v.startTime, {
    message: "Ends after it starts",
    path: ["endTime"],
  });

/// A Calendar entry's fields, for making one or editing it: the day, the times or all
/// day, and where. Short related fields sit side by side, as on the desktop.
export function CalendarEntryForm({
  initial,
  showTitle,
  readOnly = false,
  submitLabel,
  status,
  onSubmit,
}: {
  initial: CalendarEntryInput;
  showTitle: boolean;
  readOnly?: boolean;
  submitLabel: string;
  status: { isPending: boolean; isSuccess: boolean; isError: boolean };
  onSubmit: (input: CalendarEntryInput) => void;
}) {
  const theme = useTheme();
  const form = useForm({
    defaultValues: {
      title: initial.title,
      date: initial.date,
      startTime: initial.startTime ?? "",
      endTime: initial.endTime ?? "",
      allDay: initial.allDay,
      location: initial.location ?? "",
    },
    validators: {
      onChange: schema,
      onSubmit: showTitle
        ? schema.refine((v) => v.title.trim().length > 0, {
            message: "Give it a title",
            path: ["title"],
          })
        : schema,
    },
    onSubmit: ({ value }) =>
      onSubmit({
        title: value.title.trim(),
        date: value.date,
        startTime: value.startTime || null,
        endTime: value.endTime || null,
        allDay: value.allDay,
        location: value.location.trim() || null,
      }),
  });
  return (
    <View style={{ gap: theme.space(3) }}>
      {showTitle ? (
        <form.Field name="title">
          {(field) => (
            <Field
              label="Title"
              required
              autoFocus
              placeholder="Dentist"
              value={field.state.value}
              onChangeText={field.handleChange}
              onBlur={field.handleBlur}
              error={fieldError(field)}
            />
          )}
        </form.Field>
      ) : null}
      <form.Field name="date">
        {(field) => (
          <Field
            label="Day"
            required
            editable={!readOnly}
            placeholder="2026-10-31"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
            keyboardType="numbers-and-punctuation"
          />
        )}
      </form.Field>
      <form.Field name="allDay">
        {(field) => (
          <View
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text>All day</Text>
            <Switch
              accessibilityLabel="All day"
              disabled={readOnly}
              value={field.state.value}
              onValueChange={field.handleChange}
            />
          </View>
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.values.allDay}>
        {(allDay) =>
          allDay ? null : (
            <View style={{ flexDirection: "row", gap: theme.space(3) }}>
              <View style={{ flex: 1 }}>
                <form.Field name="startTime">
                  {(field) => (
                    <Field
                      label="Starts"
                      editable={!readOnly}
                      placeholder="09:00"
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      error={fieldError(field)}
                      keyboardType="numbers-and-punctuation"
                    />
                  )}
                </form.Field>
              </View>
              <View style={{ flex: 1 }}>
                <form.Field name="endTime">
                  {(field) => (
                    <Field
                      label="Ends"
                      editable={!readOnly}
                      placeholder="10:00"
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      error={fieldError(field)}
                      keyboardType="numbers-and-punctuation"
                    />
                  )}
                </form.Field>
              </View>
            </View>
          )
        }
      </form.Subscribe>
      <form.Field name="location">
        {(field) => (
          <Field
            label="Where"
            editable={!readOnly}
            placeholder="Room 2"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      {!readOnly ? (
        <Button
          label={submitLabel}
          variant="primary"
          status={statusOf(status)}
          errorLabel="Couldn't save"
          onPress={() => void form.handleSubmit()}
        />
      ) : null}
    </View>
  );
}
