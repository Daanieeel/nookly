import { labelOption, spaceOption, statusOption } from "./option-badges.tsx";
import { ACCENT_COLORS } from "@nookly/shared/colors";
import {
  createAssignment,
  createBookmark,
  createCalendarEntrySeries,
  DEFAULT_REPEAT,
  repeatProblem,
  type RepeatPlan,
  createCourse,
  createDeck,
  createExam,
  createPage,
  createSpace,
  createTask,
  type EntityRecord,
} from "@nookly/shared/data";
import type { LocalDb } from "@nookly/shared/data";
import { IconMapPin, IconX } from "@tabler/icons-react-native";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import { useLabels, useSpaces, useStatuses } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { FormSection } from "../ui/kit/Form.tsx";
import { Glyph } from "../ui/kit/Glyph.tsx";
import { useSemanticPair } from "../ui/kit/scheme.ts";
import { EntityIcon } from "../ui/icons.tsx";
import { Screen } from "../ui/Screen.tsx";
import { SheetTrigger } from "../ui/SelectField.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { Text } from "../ui/Text.tsx";
import { ExamPicker } from "./StudyPickers.tsx";
import { hourAfter, localDay } from "./dates.ts";
import { fieldError } from "./forms.ts";
import { SpacePicker } from "./SpacePicker.tsx";
import { ColorChoices } from "../ui/kit/ColorChoices.tsx";
import { RepeatPill } from "./RepeatPicker.tsx";
import {
  ComposeFooter,
  ComposeHeader,
  ComposeLine,
  ComposeText,
  ComposeTitle,
  Pill,
  PillSelect,
} from "../ui/sheet/Compose.tsx";
import { haptic } from "../ui/haptics.ts";
import {
  ComposeForm,
  CoursePill,
  DayPill,
  EntitySearch,
  LabelsPill,
  LinkPill,
  TimePill,
} from "./ComposeForm.tsx";

/// The Space to make something in: the one asked for, else the first.
export function useTargetSpace(asked?: string) {
  const { data: spaces = [] } = useSpaces();
  const [chosen, setChosen] = useState<string | null>(asked ?? null);
  return [chosen ?? spaces[0]?.id ?? null, setChosen] as const;
}

const titled = z.object({ title: z.string().trim().min(1, "Give it a title") });

/// The item a new task links to, one at most: the field shows it; tapped, a search in a
/// sheet, as the desktop's entity picker.
export function LinkTarget({
  value,
  onChange,
}: {
  value: EntityRecord | null;
  onChange: (e: EntityRecord | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const muted = useSemanticPair("tertiaryLabel");
  return (
    <>
      <SheetTrigger
        label="Link to"
        text={value ? value.title || "Untitled" : null}
        icon={value ? <EntityIcon type={value.type} icon={value.icon} /> : null}
        placeholder="None"
        onPress={() => setOpen(true)}
        trailing={
          value ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove Link"
              hitSlop={12}
              onPress={() => onChange(null)}
              className="active:opacity-60"
            >
              <Glyph icon={IconX} size={17} color={muted.hex} />
            </Pressable>
          ) : undefined
        }
      />
      <Sheet open={open} onOpenChange={setOpen} title="Link to" presentation="card">
        <EntitySearch onPick={onChange} />
      </Sheet>
    </>
  );
}

/// Labels of a Space picked for something new: the field lists them; tapped, the labels in
/// a sheet to tick.
export function LabelsField({
  spaceId,
  value,
  onChange,
}: {
  spaceId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: labels = [] } = useLabels(spaceId);
  const [open, setOpen] = useState(false);
  const names = labels.filter((l) => value.includes(l.id)).map((l) => l.name);
  if (labels.length === 0) return null;
  return (
    <>
      <SheetTrigger
        label="Labels"
        text={names.length > 0 ? names.join(", ") : null}
        placeholder="None"
        onPress={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen} title="Labels" presentation="card">
        <OptionList
          label="Labels"
          multiple
          values={value}
          options={labels.map(labelOption)}
          onToggle={(id, on) => onChange(on ? [...value, id] : value.filter((x) => x !== id))}
        />
      </Sheet>
    </>
  );
}

/// New Task, as Linear's new issue (D65): its title, a description in the page editor,
/// and the status, a day, labels of its Space and an item to link it to as pills. More
/// lands in its detail.
export function NewTaskScreen({
  spaceId,
  statusId: first,
}: {
  spaceId?: string;
  statusId?: string;
}) {
  const [space, setSpace] = useTargetSpace(spaceId);
  const { data: statuses = [] } = useStatuses();
  const [statusId, setStatusId] = useState(first ?? "backlog");
  const [due, setDue] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [link, setLink] = useState<EntityRecord | null>(null);
  return (
    <ComposeForm
      spaceId={space}
      onSpaceChange={(id) => {
        setSpace(id);
        setChosen([]);
      }}
      sendLabel="Create Task"
      titleLabel="Task title"
      titlePlaceholder="Call the dentist"
      create={(db, at, title) => createTask(db, at, title, due, { statusId, labelIds: chosen })}
      link={link}
      pills={
        <>
          <PillSelect
            label="Status"
            value={statusId}
            options={statuses.map(statusOption)}
            onChange={setStatusId}
          />
          <DayPill label="Due date" value={due} onChange={setDue} />
          {space ? <LabelsPill spaceId={space} value={chosen} onChange={setChosen} /> : null}
          <LinkPill value={link} onChange={setLink} />
        </>
      }
    />
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
      <FormSection>
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
      </FormSection>
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
      <FormSection>
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
      </FormSection>
      <Button
        label="Add Bookmark"
        status={statusOf(create)}
        errorLabel="Couldn't add it"
        onPress={() => void form.handleSubmit()}
      />
    </Screen>
  );
}

/// New Calendar entry, as Linear's compose sheet (D65): its title, where and a
/// description, then the day, the times or All day and a last day as pills.
export function NewEntryScreen({
  spaceId,
  date,
  start,
}: {
  spaceId?: string;
  date?: string;
  start?: string;
}) {
  const close = useCloseSheet();
  const { data: spaces = [] } = useSpaces();
  const [space, setSpace] = useTargetSpace(spaceId);
  const [title, setTitle] = useState("");
  const [where, setWhere] = useState("");
  const [description, setDescription] = useState("");
  const [day, setDay] = useState(date ?? localDay());
  const [lastDay, setLastDay] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [starts, setStarts] = useState<string | null>(start ?? "09:00");
  const [ends, setEnds] = useState<string | null>(hourAfter(start ?? "09:00"));
  const [repeat, setRepeat] = useState<RepeatPlan>(DEFAULT_REPEAT);
  const problem =
    entryProblem({ day, lastDay, allDay, starts, ends }) ??
    (lastDay ? null : repeatProblem(day, repeat));
  const create = useLocalWrite((db, name: string) => {
    if (!space) throw new Error("Make a Space first.");
    return createCalendarEntrySeries(
      db,
      space,
      {
        title: name,
        date: day,
        endDate: lastDay,
        startTime: allDay ? null : starts,
        endTime: allDay ? null : ends,
        allDay,
        location: where.trim() || null,
        description: description.trim() || null,
      },
      repeat,
    );
  });
  const canSend = title.trim() !== "" && space !== null && !problem && !create.isPending;
  return (
    <View className="gap-1">
      <ComposeHeader
        sendLabel="Add to Calendar"
        canSend={canSend}
        onSend={() => create.mutate(title.trim(), { onSuccess: () => close() })}
        context={
          <PillSelect
            label="Space"
            value={space}
            options={spaces.map(spaceOption)}
            onChange={setSpace}
          />
        }
      />
      <ComposeTitle
        label="Entry title"
        value={title}
        onChangeText={setTitle}
        placeholder="Dentist"
      />
      <ComposeLine
        label="Where"
        icon={IconMapPin}
        value={where}
        onChangeText={setWhere}
        placeholder="Add a place"
      />
      <ComposeText
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Description…"
      />
      {problem || create.error ? (
        <Text tone="destructive" variant="small">
          {problem ?? create.error?.message}
        </Text>
      ) : null}
      <ComposeFooter>
        <DayPill label="Day" value={day} clearable={false} onChange={(d) => d && setDay(d)} />
        <Pill
          label="All day"
          value={null}
          checked={allDay}
          onPress={() => {
            haptic("toggle");
            setAllDay(!allDay);
          }}
        />
        {allDay ? null : (
          <>
            <TimePill label="Starts" value={starts} onChange={setStarts} />
            <TimePill label="Ends" value={ends} onChange={setEnds} />
          </>
        )}
        {/* An entry over several days never repeats, as on the desktop. */}
        {lastDay ? null : <RepeatPill value={repeat} onChange={setRepeat} />}
        <DayPill label="Last day" value={lastDay} onChange={setLastDay} />
      </ComposeFooter>
    </View>
  );
}

/// What keeps an entry from being saved: a last day before the first, an end before the
/// start. Null when it is fine.
export function entryProblem(v: {
  day: string;
  lastDay: string | null;
  allDay: boolean;
  starts: string | null;
  ends: string | null;
}): string | null {
  if (v.lastDay && v.lastDay < v.day) return "Ends on or after the first day";
  if (!v.allDay && v.starts && v.ends && v.ends <= v.starts && !v.lastDay)
    return "Ends after it starts";
  return null;
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
      <FormSection>
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
      </FormSection>
      <ColorChoices
        label="Color"
        colors={ACCENT_COLORS}
        value={color}
        onChange={(c) => c && setColor(c)}
      />
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
      <FormSection>
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
      </FormSection>
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

/// A new exam or assignment, as Linear's compose sheet (D65): its title, a description,
/// and its Course (it belongs to exactly one) and day as pills; then straight into its page.
function NewCourseItem({
  spaceId,
  courseId,
  noun,
  titlePlaceholder,
  dayLabel,
  create,
}: {
  spaceId?: string;
  courseId?: string;
  noun: "Exam" | "Assignment";
  titlePlaceholder: string;
  dayLabel: string;
  create: (
    db: LocalDb,
    space: string,
    title: string,
    course: string,
    day: string | null,
  ) => Promise<string>;
}) {
  const router = useRouter();
  const [space, setSpace] = useTargetSpace(spaceId);
  const [course, setCourse] = useState<string | null>(courseId ?? null);
  const [day, setDay] = useState<string | null>(null);
  return (
    <ComposeForm
      spaceId={space}
      onSpaceChange={
        spaceId
          ? undefined
          : (id) => {
              setSpace(id);
              setCourse(null);
            }
      }
      sendLabel={`Create ${noun}`}
      titleLabel={`${noun} title`}
      titlePlaceholder={titlePlaceholder}
      ready={course !== null}
      create={(db, at, title) => {
        if (!course) throw new Error("Pick its Course.");
        return create(db, at, title, course, day);
      }}
      after={(id) => router.push(`/entity/${id}`)}
      pills={
        <>
          {space ? <CoursePill spaceId={space} value={course} onChange={setCourse} /> : null}
          <DayPill label={dayLabel} value={day} onChange={setDay} />
        </>
      }
    />
  );
}

export function NewExamScreen({ spaceId, courseId }: { spaceId?: string; courseId?: string }) {
  return (
    <NewCourseItem
      spaceId={spaceId}
      courseId={courseId}
      noun="Exam"
      titlePlaceholder="Final exam"
      dayLabel="Day"
      create={createExam}
    />
  );
}

export function NewAssignmentScreen({
  spaceId,
  courseId,
}: {
  spaceId?: string;
  courseId?: string;
}) {
  return (
    <NewCourseItem
      spaceId={spaceId}
      courseId={courseId}
      noun="Assignment"
      titlePlaceholder="Problem sheet 3"
      dayLabel="Due date"
      create={createAssignment}
    />
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
