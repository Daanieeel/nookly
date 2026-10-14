import {
  createBookmark,
  createCalendarEntry,
  createPage,
  createSpace,
  createTask,
} from "@nookly/shared/data";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import { useSpaces } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { CalendarEntryForm } from "./CalendarEntryForm.tsx";
import { localDay } from "./dates.ts";
import { fieldError } from "./forms.ts";
import { SpacePicker } from "./SpacePicker.tsx";

/// The Space to make something in: the one asked for, else the first.
function useTargetSpace(asked?: string) {
  const { data: spaces = [] } = useSpaces();
  const [chosen, setChosen] = useState<string | null>(asked ?? null);
  return [chosen ?? spaces[0]?.id ?? null, setChosen] as const;
}

const titled = z.object({ title: z.string().trim().min(1, "Give it a title") });

/// New Task: a title first, like the desktop's quick create. More lands in its detail.
export function NewTaskScreen({ spaceId }: { spaceId?: string }) {
  const theme = useTheme();
  const router = useRouter();
  const [space, setSpace] = useTargetSpace(spaceId);
  const create = useLocalWrite((db, title: string) => {
    if (!space) throw new Error("Pick a Space");
    return createTask(db, space, title);
  });
  const form = useForm({
    defaultValues: { title: "" },
    validators: { onChange: titled, onSubmit: titled },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(value.title.trim());
      form.reset();
    },
  });
  return (
    <Screen>
      <SpacePicker value={space} onChange={setSpace} />
      <form.Field name="title">
        {(field) => (
          <Field
            label="Title"
            required
            autoFocus
            placeholder="Call the dentist"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            returnKeyType="done"
            onSubmitEditing={() => void form.handleSubmit()}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <View style={{ flexDirection: "row", gap: theme.space(2) }}>
        <Button
          label="Create"
          variant="primary"
          status={statusOf(create)}
          successLabel="Created"
          errorLabel="Couldn't create"
          onPress={() => void form.handleSubmit()}
        />
        <Button label="Done" variant="ghost" onPress={() => router.back()} />
      </View>
      <Text variant="small" tone="muted">
        Make one after another; the sheet stays open.
      </Text>
    </Screen>
  );
}

/// New page or jot: straight into its page, title first.
export function NewPageScreen({ spaceId, type }: { spaceId?: string; type: "note" | "jot" }) {
  const router = useRouter();
  const [space, setSpace] = useTargetSpace(spaceId);
  const create = useLocalWrite((db, title: string) => {
    if (!space) throw new Error("Pick a Space");
    return createPage(db, space, type, title);
  });
  const form = useForm({
    defaultValues: { title: "" },
    onSubmit: async ({ value }) => {
      const id = await create.mutateAsync(value.title.trim());
      router.replace(`/entity/${id}`);
    },
  });
  return (
    <Screen>
      <SpacePicker value={space} onChange={setSpace} />
      <form.Field name="title">
        {(field) => (
          <Field
            label="Title"
            autoFocus
            placeholder={type === "jot" ? "A quick thought" : "Untitled"}
            value={field.state.value}
            onChangeText={field.handleChange}
            onSubmitEditing={() => void form.handleSubmit()}
          />
        )}
      </form.Field>
      <Button
        label={type === "jot" ? "New Jot" : "New Page"}
        variant="primary"
        status={statusOf(create)}
        errorLabel="Couldn't create"
        onPress={() => void form.handleSubmit()}
      />
    </Screen>
  );
}

const bookmarkSchema = z.object({ url: z.url("Paste a web address"), title: z.string().max(300) });

/// New Bookmark: it starts from an address.
export function NewBookmarkScreen({ spaceId }: { spaceId?: string }) {
  const router = useRouter();
  const [space, setSpace] = useTargetSpace(spaceId);
  const create = useLocalWrite((db, input: z.infer<typeof bookmarkSchema>) => {
    if (!space) throw new Error("Pick a Space");
    return createBookmark(db, space, input.url, input.title);
  });
  const form = useForm({
    defaultValues: { url: "", title: "" },
    validators: { onChange: bookmarkSchema, onSubmit: bookmarkSchema },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(value);
      router.back();
    },
  });
  return (
    <Screen>
      <SpacePicker value={space} onChange={setSpace} />
      <form.Field name="url">
        {(field) => (
          <Field
            label="Address"
            required
            autoFocus
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <form.Field name="title">
        {(field) => (
          <Field
            label="Title"
            placeholder="Taken from the address when empty"
            value={field.state.value}
            onChangeText={field.handleChange}
          />
        )}
      </form.Field>
      <Button
        label="Add Bookmark"
        variant="primary"
        status={statusOf(create)}
        errorLabel="Couldn't add it"
        onPress={() => void form.handleSubmit()}
      />
    </Screen>
  );
}

/// New Calendar entry: the day comes first, today by default.
export function NewEntryScreen({ spaceId }: { spaceId?: string }) {
  const router = useRouter();
  const [space, setSpace] = useTargetSpace(spaceId);
  const create = useLocalWrite((db, input: Parameters<typeof createCalendarEntry>[2]) => {
    if (!space) throw new Error("Pick a Space");
    return createCalendarEntry(db, space, input);
  });
  return (
    <Screen>
      <SpacePicker value={space} onChange={setSpace} />
      <CalendarEntryForm
        initial={{
          title: "",
          date: localDay(),
          startTime: "09:00",
          endTime: "10:00",
          allDay: false,
          location: null,
        }}
        showTitle
        submitLabel="Add to Calendar"
        status={create}
        onSubmit={(input) => void create.mutateAsync(input).then(() => router.back())}
      />
    </Screen>
  );
}

const SPACE_COLORS = ["#0070f3", "#00873d", "#d6336c", "#9147d6", "#ab7a00", "#64748b"];
const spaceSchema = z.object({ name: z.string().trim().min(1, "Name it").max(60) });

/// New Space: a name and its color.
export function NewSpaceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [color, setColor] = useState(SPACE_COLORS[0]);
  const create = useLocalWrite((db, name: string) => createSpace(db, name, color));
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: spaceSchema, onSubmit: spaceSchema },
    onSubmit: async ({ value }) => {
      const id = await create.mutateAsync(value.name.trim());
      router.replace(`/space/${id}`);
    },
  });
  return (
    <Screen>
      <form.Field name="name">
        {(field) => (
          <Field
            label="Name"
            required
            autoFocus
            placeholder="Work"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Color"
        style={{ flexDirection: "row", gap: theme.space(3) }}
      >
        {SPACE_COLORS.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityLabel={`Color ${c}`}
            accessibilityState={{ checked: c === color }}
            onPress={() => setColor(c)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c,
              borderWidth: 3,
              borderColor: c === color ? theme.colors.foreground : "transparent",
            }}
          />
        ))}
      </View>
      <Button
        label="Create Space"
        variant="primary"
        status={statusOf(create)}
        errorLabel="Couldn't create"
        onPress={() => void form.handleSubmit()}
      />
    </Screen>
  );
}
