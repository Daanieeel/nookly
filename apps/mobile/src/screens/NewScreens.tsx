import { FORM_FIELD_CLASSES } from "@nookly/frontend/classes";
import { ACCENT_COLORS } from "@nookly/shared/colors";
import {
  createAssignment,
  createBookmark,
  createCalendarEntry,
  createCourse,
  createDeck,
  createExam,
  createPage,
  createSpace,
  createTask,
  relate,
  type EntityRecord,
} from "@nookly/shared/data";
import type { LocalDb } from "@nookly/shared/data";
import { IconTag, IconX } from "@tabler/icons-react-native";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import { useLabels, useRecents, useSearch, useSpaces, useStatuses } from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Field, FieldLabel } from "../ui/Field.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { Screen } from "../ui/Screen.tsx";
import { SelectField, SheetTrigger } from "../ui/SelectField.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { useTheme } from "../ui/theme.ts";
import { Text } from "../ui/Text.tsx";
import { DateField } from "../ui/DateField.tsx";
import { CalendarEntryForm } from "./CalendarEntryForm.tsx";
import { CoursePicker, ExamPicker } from "./StudyPickers.tsx";
import { localDay } from "./dates.ts";
import { fieldError } from "./forms.ts";
import { SpacePicker } from "./SpacePicker.tsx";
import { StatusIcon } from "./TaskRow.tsx";
import { Swatch } from "../ui/Swatch.tsx";

/// The Space to make something in: the one asked for, else the first.
export function useTargetSpace(asked?: string) {
  const { data: spaces = [] } = useSpaces();
  const [chosen, setChosen] = useState<string | null>(asked ?? null);
  return [chosen ?? spaces[0]?.id ?? null, setChosen] as const;
}

const titled = z.object({ title: z.string().trim().min(1, "Give it a title") });

/// The item a new task links to, one at most: the field shows it; tapped, a search in a
/// sheet, as the desktop's entity picker.
function LinkTarget({
  value,
  onChange,
}: {
  value: EntityRecord | null;
  onChange: (e: EntityRecord | null) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View className={FORM_FIELD_CLASSES}>
      <FieldLabel label="Link to" />
      <View className="flex-row items-center gap-1">
        <SheetTrigger
          label="Link to"
          text={value ? value.title || "Untitled" : null}
          icon={value ? <EntityIcon type={value.type} icon={value.icon} /> : null}
          placeholder="Search for an item"
          onPress={() => setOpen(true)}
        />
        {value ? (
          <IconButton
            label="Remove Link"
            icon={<IconX size={18} color={theme.colors.mutedForeground} />}
            onPress={() => onChange(null)}
          />
        ) : null}
      </View>
      <Sheet open={open} onOpenChange={setOpen} title="Link to" size="large">
        <EntitySearch onPick={onChange} />
      </Sheet>
    </View>
  );
}

/// Finds an item by its title, key or text, Recents first: the desktop's entity picker.
function EntitySearch({ onPick }: { onPick: (e: EntityRecord) => void }) {
  const [query, setQuery] = useState("");
  const { data: results = [] } = useSearch(query);
  const { data: recent = [] } = useRecents();
  const shown = query.trim() ? results.slice(0, 30) : recent;
  return (
    <View className="gap-2">
      <Field
        label="Find an item"
        autoFocus
        placeholder="Titles, keys like TSK-14, page text"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <OptionList
        label="Items"
        options={shown.map((e) => ({
          id: e.id,
          label: e.title || "Untitled",
          icon: <EntityIcon type={e.type} icon={e.icon} />,
        }))}
        value={null}
        onChange={(id) => {
          const e = shown.find((x) => x.id === id);
          if (e) onPick(e);
        }}
      />
    </View>
  );
}

/// Labels of a Space picked for something new: the field lists them; tapped, the labels in
/// a sheet to tick.
function LabelsField({
  spaceId,
  value,
  onChange,
}: {
  spaceId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const theme = useTheme();
  const { data: labels = [] } = useLabels(spaceId);
  const [open, setOpen] = useState(false);
  const names = labels.filter((l) => value.includes(l.id)).map((l) => l.name);
  if (labels.length === 0) return null;
  return (
    <View className={FORM_FIELD_CLASSES}>
      <FieldLabel label="Labels" />
      <View className="flex-row">
        <SheetTrigger
          label="Labels"
          text={names.length > 0 ? names.join(", ") : null}
          icon={<IconTag size={16} color={theme.colors.mutedForeground} />}
          placeholder="No labels"
          onPress={() => setOpen(true)}
        />
      </View>
      <Sheet open={open} onOpenChange={setOpen} title="Labels">
        <OptionList
          label="Labels"
          multiple
          values={value}
          options={labels.map((l) => ({
            id: l.id,
            label: l.name,
            icon: <View className="size-2 rounded-full" style={{ backgroundColor: l.color }} />,
          }))}
          onToggle={(id, on) => onChange(on ? [...value, id] : value.filter((x) => x !== id))}
        />
      </Sheet>
    </View>
  );
}

/// New Task: a title first, like the desktop's quick create, with the status, a day,
/// labels of its Space and an item to link it to when they are wanted. More lands in
/// its detail.
export function NewTaskScreen({
  spaceId,
  statusId: first,
}: {
  spaceId?: string;
  statusId?: string;
}) {
  const close = useCloseSheet();
  const [space, setSpace] = useTargetSpace(spaceId);
  const { data: statuses = [] } = useStatuses();
  const [statusId, setStatusId] = useState(first ?? "backlog");
  const [due, setDue] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [link, setLink] = useState<EntityRecord | null>(null);
  const create = useLocalWrite(async (db, title: string) => {
    if (!space) throw new Error("Pick a Space");
    const id = await createTask(db, space, title, due, { statusId, labelIds: chosen });
    if (link) await relate(db, id, link.id);
    return id;
  });
  const form = useForm({
    defaultValues: { title: "" },
    validators: { onChange: titled, onSubmit: titled },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(value.title.trim());
      form.reset();
      setLink(null);
      setChosen([]);
    },
  });
  return (
    <Screen>
      <SpacePicker
        value={space}
        onChange={(id) => {
          setSpace(id);
          setChosen([]);
        }}
      />
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
      <SelectField
        label="Status"
        value={statusId}
        onChange={setStatusId}
        options={statuses.map((s) => ({
          id: s.id,
          label: s.name,
          icon: <StatusIcon status={s} size={16} />,
        }))}
      />
      <DateField label="Due date" value={due} onChange={setDue} />
      {space ? <LabelsField spaceId={space} value={chosen} onChange={setChosen} /> : null}
      <LinkTarget value={link} onChange={setLink} />
      <View className="flex-row gap-2">
        <Button
          label="Create"
          status={statusOf(create)}
          successLabel="Created"
          errorLabel="Couldn't create"
          onPress={() => void form.handleSubmit()}
        />
        <Button label="Done" variant="ghost" onPress={() => close()} />
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
  const close = useCloseSheet();
  const [space, setSpace] = useTargetSpace(spaceId);
  const create = useLocalWrite((db, title: string) => {
    if (!space) throw new Error("Pick a Space");
    return createPage(db, space, type, title);
  });
  const form = useForm({
    defaultValues: { title: "" },
    onSubmit: async ({ value }) => {
      const id = await create.mutateAsync(value.title.trim());
      close(() => router.push(`/entity/${id}`));
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
  const close = useCloseSheet();
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
      close();
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
        status={statusOf(create)}
        errorLabel="Couldn't add it"
        onPress={() => void form.handleSubmit()}
      />
    </Screen>
  );
}

/// New Calendar entry: the day comes first, today by default.
export function NewEntryScreen({ spaceId }: { spaceId?: string }) {
  const close = useCloseSheet();
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
        onSubmit={(input) => void create.mutateAsync(input).then(() => close())}
      />
    </Screen>
  );
}

const spaceSchema = z.object({ name: z.string().trim().min(1, "Name it").max(60) });

/// New Space: a name and its color.
export function NewSpaceScreen() {
  const router = useRouter();
  const close = useCloseSheet();
  const [color, setColor] = useState(ACCENT_COLORS[9]);
  const create = useLocalWrite((db, name: string) => createSpace(db, name, color));
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: spaceSchema, onSubmit: spaceSchema },
    onSubmit: async ({ value }) => {
      const id = await create.mutateAsync(value.name.trim());
      close(() => router.push(`/space/${id}`));
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
        className="-mx-2.5 flex-row flex-wrap"
      >
        {ACCENT_COLORS.map((c) => (
          <Swatch
            key={c}
            label={`Color ${c}`}
            color={c}
            selected={c === color}
            onPress={() => setColor(c)}
          />
        ))}
      </View>
      <Button
        label="Create Space"
        status={statusOf(create)}
        errorLabel="Couldn't create"
        onPress={() => void form.handleSubmit()}
      />
    </Screen>
  );
}

/// A new study item: a title, what it belongs to, then straight into its page.
function NewStudyItem({
  spaceId,
  placeholder,
  submitLabel,
  create,
  children,
}: {
  spaceId?: string;
  placeholder: string;
  submitLabel: string;
  create: (db: LocalDb, space: string, title: string) => Promise<string>;
  children?: (space: string) => React.ReactNode;
}) {
  const router = useRouter();
  const close = useCloseSheet();
  const [space, setSpace] = useTargetSpace(spaceId);
  const write = useLocalWrite((db, title: string) => {
    if (!space) throw new Error("Pick a Space");
    return create(db, space, title);
  });
  const form = useForm({
    defaultValues: { title: "" },
    validators: { onChange: titled, onSubmit: titled },
    onSubmit: ({ value }) =>
      write.mutate(value.title.trim(), {
        onSuccess: (id) => close(() => router.push(`/entity/${id}`)),
      }),
  });
  return (
    <Screen>
      {spaceId ? null : <SpacePicker value={space} onChange={setSpace} />}
      <form.Field name="title">
        {(field) => (
          <Field
            label="Title"
            required
            autoFocus
            placeholder={placeholder}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      {space && children ? children(space) : null}
      {write.error ? <Text tone="destructive">{write.error.message}</Text> : null}
      <Button
        label={submitLabel}
        status={statusOf(write)}
        errorLabel="Couldn't create"
        onPress={() => void form.handleSubmit()}
      />
    </Screen>
  );
}

export function NewCourseScreen({ spaceId }: { spaceId?: string }) {
  return (
    <NewStudyItem
      spaceId={spaceId}
      placeholder="Algorithms"
      submitLabel="Create Course"
      create={createCourse}
    />
  );
}

/// An exam or assignment belongs to exactly one Course, picked here.
function CourseAndDay({
  space,
  course,
  setCourse,
  day,
  setDay,
  dayLabel,
}: {
  space: string;
  course: string | null;
  setCourse: (id: string) => void;
  day: string | null;
  setDay: (day: string | null) => void;
  dayLabel: string;
}) {
  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        Course
      </Text>
      <CoursePicker spaceId={space} value={course} onChange={setCourse} />
      <DateField label={dayLabel} value={day} onChange={setDay} />
    </View>
  );
}

const needsCourse = (course: string | null) => {
  if (!course) throw new Error("Pick its Course.");
  return course;
};

export function NewExamScreen({ spaceId, courseId }: { spaceId?: string; courseId?: string }) {
  const [course, setCourse] = useState<string | null>(courseId ?? null);
  const [day, setDay] = useState<string | null>(null);
  return (
    <NewStudyItem
      spaceId={spaceId}
      placeholder="Final exam"
      submitLabel="Create Exam"
      create={(db, space, title) => createExam(db, space, title, needsCourse(course), day)}
    >
      {(space) => (
        <CourseAndDay
          space={space}
          course={course}
          setCourse={setCourse}
          day={day}
          setDay={setDay}
          dayLabel="Day"
        />
      )}
    </NewStudyItem>
  );
}

export function NewAssignmentScreen({
  spaceId,
  courseId,
}: {
  spaceId?: string;
  courseId?: string;
}) {
  const [course, setCourse] = useState<string | null>(courseId ?? null);
  const [day, setDay] = useState<string | null>(null);
  return (
    <NewStudyItem
      spaceId={spaceId}
      placeholder="Problem sheet 3"
      submitLabel="Create Assignment"
      create={(db, space, title) => createAssignment(db, space, title, needsCourse(course), day)}
    >
      {(space) => (
        <CourseAndDay
          space={space}
          course={course}
          setCourse={setCourse}
          day={day}
          setDay={setDay}
          dayLabel="Due date"
        />
      )}
    </NewStudyItem>
  );
}

export function NewDeckScreen({ spaceId }: { spaceId?: string }) {
  const [exam, setExam] = useState<string | null>(null);
  return (
    <NewStudyItem
      spaceId={spaceId}
      placeholder="Sorting algorithms"
      submitLabel="Create Deck"
      create={(db, space, title) => createDeck(db, space, title, exam)}
    >
      {(space) => (
        <View className="gap-2">
          <Text variant="label" tone="muted">
            Prepares for
          </Text>
          <ExamPicker spaceId={space} value={exam} onChange={setExam} />
        </View>
      )}
    </NewStudyItem>
  );
}
