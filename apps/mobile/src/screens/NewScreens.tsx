import { COLOR_SWATCH_CLASSES, COLOR_SWATCH_SELECTED_CLASSES } from "@nookly/frontend/classes";
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
import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import { useLabels, useSearch, useSpaces, useStatuses } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { cn } from "../ui/classes.ts";
import { Field, FieldLabel } from "../ui/Field.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { DateField } from "../ui/DateField.tsx";
import { CalendarEntryForm } from "./CalendarEntryForm.tsx";
import { CoursePicker, ExamPicker } from "./StudyDetail.tsx";
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

/// The item a new task links to: found by searching, one at most.
function LinkTarget({
  value,
  onChange,
}: {
  value: EntityRecord | null;
  onChange: (e: EntityRecord | null) => void;
}) {
  const [query, setQuery] = useState("");
  const { data: results = [] } = useSearch(query);
  if (value) {
    return (
      <View className="gap-2">
        <FieldLabel label="Link to" />
        <ChipGroup label="Linked item">
          <Chip label={value.title || "Untitled"} selected onPress={() => onChange(null)} />
        </ChipGroup>
        <Text variant="small" tone="muted">
          Tap to remove the link.
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-2">
      <Field
        label="Link to"
        placeholder="Search for an item"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />
      {query.trim() ? (
        <ChipGroup label="Matches" scroll>
          {results.slice(0, 8).map((e) => (
            <Chip
              key={e.id}
              label={e.title || "Untitled"}
              selected={false}
              onPress={() => {
                onChange(e);
                setQuery("");
              }}
            />
          ))}
        </ChipGroup>
      ) : null}
    </View>
  );
}

/// New Task: a title first, like the desktop's quick create, with the status, a day,
/// labels of its Space and an item to link it to when they are wanted. More lands in
/// its detail.
export function NewTaskScreen({ spaceId }: { spaceId?: string }) {
  const router = useRouter();
  const [space, setSpace] = useTargetSpace(spaceId);
  const { data: statuses = [] } = useStatuses();
  const { data: labels = [] } = useLabels(space ?? "");
  const [statusId, setStatusId] = useState("backlog");
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
      <ChipGroup label="Status" scroll>
        {statuses.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            selected={s.id === statusId}
            onPress={() => setStatusId(s.id)}
          />
        ))}
      </ChipGroup>
      <DateField label="Due date" value={due} onChange={setDue} />
      {labels.length > 0 ? (
        <ChipGroup label="Labels" multiple scroll>
          {labels.map((l) => (
            <Chip
              key={l.id}
              label={l.name}
              multiple
              selected={chosen.includes(l.id)}
              onPress={() =>
                setChosen((c) => (c.includes(l.id) ? c.filter((x) => x !== l.id) : [...c, l.id]))
              }
            />
          ))}
        </ChipGroup>
      ) : null}
      <LinkTarget value={link} onChange={setLink} />
      <View className="flex-row gap-2">
        <Button
          label="Create"
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

const spaceSchema = z.object({ name: z.string().trim().min(1, "Name it").max(60) });

/// New Space: a name and its color.
export function NewSpaceScreen() {
  const router = useRouter();
  const [color, setColor] = useState(ACCENT_COLORS[9]);
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
        className="flex-row flex-wrap gap-3"
      >
        {ACCENT_COLORS.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityLabel={`Color ${c}`}
            accessibilityState={{ checked: c === color }}
            onPress={() => setColor(c)}
            hitSlop={8}
            className={cn(COLOR_SWATCH_CLASSES, c === color && COLOR_SWATCH_SELECTED_CLASSES)}
            style={{ backgroundColor: c }}
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
  const [space, setSpace] = useTargetSpace(spaceId);
  const write = useLocalWrite((db, title: string) => {
    if (!space) throw new Error("Pick a Space");
    return create(db, space, title);
  });
  const form = useForm({
    defaultValues: { title: "" },
    validators: { onChange: titled, onSubmit: titled },
    onSubmit: ({ value }) =>
      write.mutate(value.title.trim(), { onSuccess: (id) => router.replace(`/entity/${id}`) }),
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
