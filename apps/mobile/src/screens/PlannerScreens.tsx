import {
  ACADEMIC_SYSTEMS,
  ACADEMIC_SYSTEM_KEYS,
  type AcademicSystemKey,
  REGION_TERM_DATES,
  guessCurrentTerm,
  resolveTermDates,
} from "@nookly/shared/academic";
import { useEntityMenu } from "./entity-actions.tsx";
import { FormSection } from "../ui/kit/Form.tsx";
import {
  createCourse,
  createOneOffSession,
  createSessionPage,
  createSemester,
  courseSemester,
  getOrCreateSemesterNotes,
  overrideSession,
  setCourseSemester,
  setCurrentSemester,
  updateSemester,
} from "@nookly/shared/data";
import {
  IconCalendarEvent,
  IconClock,
  IconMapPin,
  IconPlus,
  IconCalendarWeek,
} from "@tabler/icons-react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useDb, useLocalWrite } from "../data/context.tsx";
import {
  useCourseSemester,
  useAssignments,
  useCourses,
  useExams,
  useSemester,
  useSemesters,
  useSession,
  useSessionPage,
  useSessions,
  useSpaces,
} from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { DateField } from "../ui/DateField.tsx";
import { Field } from "../ui/Field.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { AtAGlance, DetailsPart, MainPart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { ChoiceProperty, DayProperty, TextRow } from "../ui/property-rows.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { SelectField } from "../ui/SelectField.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { CoursePicker } from "./StudyPickers.tsx";
import { SpacePicker } from "./SpacePicker.tsx";
import { semesterRange } from "./SemesterList.tsx";
import { addDays, dayLabel, hourAfter, localDay } from "./dates.ts";
import { PageEditor } from "./PageEditor.tsx";

/// Sessions, semesters and grades: what a student plans and is graded on.

// --- sessions -------------------------------------------------------------------------

/// A session's own day, time and place, changed for this one session. Whole series are
/// edited on the computer.
export function SessionDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  const router = useRouter();
  const { data: session } = useSession(id);
  const patch = useLocalWrite((db, p: Parameters<typeof overrideSession>[2]) =>
    overrideSession(db, id, p),
  );
  const cancel = useLocalWrite((db, cancelled: boolean) => overrideSession(db, id, { cancelled }));
  if (!session) return null;
  const properties = (
    <PropertyList>
      <DayProperty
        icon={<IconCalendarEvent size={20} color={muted} />}
        label="Day"
        clearable={false}
        value={session.date}
        readOnly={readOnly}
        onChange={(date) => date && patch.mutate({ date })}
      />
      <DayProperty
        icon={<IconClock size={20} color={muted} />}
        label="Starts"
        mode="time"
        clearable={false}
        value={session.startTime}
        readOnly={readOnly}
        onChange={(startTime) => startTime && patch.mutate({ startTime })}
      />
      <DayProperty
        icon={<IconClock size={20} color={muted} />}
        label="Ends"
        mode="time"
        clearable={false}
        value={session.endTime}
        readOnly={readOnly}
        onChange={(endTime) => endTime && patch.mutate({ endTime })}
      />
      <TextRow
        icon={<IconMapPin size={20} color={muted} />}
        label="Where"
        value={session.location}
        readOnly={readOnly}
        placeholder="Add location"
        onSave={(location) => patch.mutate({ location })}
      />
    </PropertyList>
  );
  return (
    <>
      <AtAGlance>{properties}</AtAGlance>
      <MainPart>
        <SessionNotes
          value={session.notes}
          readOnly={readOnly}
          onSave={(notes) => patch.mutate({ notes })}
        />
        <SessionPages sessionId={id} readOnly={readOnly} />
      </MainPart>
      <DetailsPart>
        <View className="gap-4">
          {session.courseTitle && session.courseId ? (
            <Section>
              <Row
                title={session.courseTitle}
                subtitle="Course"
                icon={<EntityIcon type="course" />}
                onPress={() => router.push(`/entity/${session.courseId}`)}
              />
            </Section>
          ) : null}
          {session.templateId ? (
            <Text tone="muted">
              Part of a weekly series. A change here is for this session only; edit the whole series
              on your computer.
            </Text>
          ) : null}
          {session.cancelled ? <Text tone="caution">Cancelled</Text> : null}
          {properties}
          {patch.error ? <Text tone="destructive">{patch.error.message}</Text> : null}
          {!readOnly ? (
            <View className="items-start">
              <Button
                label={session.cancelled ? "Bring Back" : "Cancel This Session"}
                variant="ghost"
                status={statusOf(cancel)}
                errorLabel="Couldn't change it"
                onPress={() => cancel.mutate(!session.cancelled)}
              />
            </View>
          ) : null}
        </View>
      </DetailsPart>
    </>
  );
}

/// What was said or set for one session, written in the page itself.
function SessionNotes({
  value,
  readOnly,
  onSave,
}: {
  value: string | null;
  readOnly: boolean;
  onSave: (text: string | null) => void;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  return (
    <Field
      label="Notes for this session"
      multiline
      editable={!readOnly}
      placeholder="Notes for this session…"
      value={text}
      onChangeText={setText}
      onEndEditing={() => text !== (value ?? "") && onSave(text.trim() || null)}
    />
  );
}

/// New Session: one session of a course. A weekly series is made on the computer.
export function NewSessionScreen({
  spaceId,
  courseId,
  date: day,
  start: from,
}: {
  spaceId?: string;
  courseId?: string;
  /// The day and time a finger rested on the calendar's hours.
  date?: string;
  start?: string;
}) {
  const router = useRouter();
  const close = useCloseSheet();
  const { data: spaces = [] } = useSpaces();
  const [chosen, setChosen] = useState<string | null>(spaceId ?? null);
  const space = chosen ?? spaces[0]?.id ?? null;
  const [course, setCourse] = useState<string | null>(courseId ?? null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(day ?? localDay());
  const [start, setStart] = useState(from ?? "10:00");
  const [end, setEnd] = useState(from ? hourAfter(from, 90) : "11:30");
  const [where, setWhere] = useState("");
  const create = useLocalWrite((db, _: undefined) => {
    if (!space) throw new Error("Pick a Space");
    if (!course) throw new Error("Pick a course for the session.");
    return createOneOffSession(db, space, {
      title: title.trim(),
      courseId: course,
      date,
      startTime: start,
      endTime: end,
      location: where.trim() || null,
    });
  });
  const submit = () =>
    create.mutate(undefined, { onSuccess: (id) => close(() => router.push(`/entity/${id}`)) });
  return (
    <Screen>
      <FormSection>
        <SpacePicker
          value={space}
          onChange={(id) => {
            setChosen(id);
            setCourse(null);
          }}
        />
        {space ? <CoursePicker spaceId={space} value={course} onChange={setCourse} /> : null}
        <Field label="Title" placeholder="Lecture 1" value={title} onChangeText={setTitle} />
        <DateField label="Day" clearable={false} value={date} onChange={(d) => d && setDate(d)} />
        <DateField
          label="Starts"
          mode="time"
          clearable={false}
          value={start}
          onChange={(t) => t && setStart(t)}
        />
        <DateField
          label="Ends"
          mode="time"
          clearable={false}
          value={end}
          onChange={(t) => t && setEnd(t)}
        />
        <Field label="Where" placeholder="Room 5" value={where} onChangeText={setWhere} />
        {create.error ? <Text tone="destructive">{create.error.message}</Text> : null}
      </FormSection>
      <Button
        label="New Session"
        status={statusOf(create)}
        errorLabel="Couldn't create"
        onPress={submit}
      />
    </Screen>
  );
}

// --- semesters ------------------------------------------------------------------------

/// A semester: its dates, whether it is the current one, its notes and its courses.
export function SemesterDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const entityMenu = useEntityMenu();
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  const router = useRouter();
  const { data: semester } = useSemester(id);
  const { data: courses = [] } = useCourses(semester?.entity.spaceId ?? null);
  const { data: members = [] } = useSemesterMembers(
    id,
    courses.map((c) => c.entity.id),
  );
  const update = useLocalWrite((db, patch: Parameters<typeof updateSemester>[2]) =>
    updateSemester(db, id, patch),
  );
  const current = useLocalWrite((db, _: undefined) =>
    setCurrentSemester(db, semester?.entity.spaceId ?? "", id),
  );
  const notes = useLocalWrite((db, _: undefined) => getOrCreateSemesterNotes(db, id));
  if (!semester) return null;
  return (
    <>
      <MainPart>
        <PageEditor entityId={id} readOnly={readOnly} live={false} />
        <SemesterStats spaceId={semester.entity.spaceId} courseIds={members} />
        <Section title="Courses">
          {members.length === 0 ? <Empty text="No courses in this semester." /> : null}
          {courses
            .filter((c) => members.includes(c.entity.id))
            .map((c) => (
              <View key={c.entity.id}>
                <Row
                  title={c.entity.title || "Untitled"}
                  subtitle={c.professor ?? c.entity.key}
                  icon={<EntityIcon type="course" icon={c.entity.icon} />}
                  onPress={() => router.push(`/entity/${c.entity.id}`)}
                  onLongPress={() => entityMenu(c.entity)}
                />
              </View>
            ))}
        </Section>
        {readOnly ? null : (
          <AddCourse
            semesterId={id}
            spaceId={semester.entity.spaceId}
            unassigned={courses.filter((c) => !members.includes(c.entity.id))}
          />
        )}
      </MainPart>
      <DetailsPart>
        <PropertyList>
          <DayProperty
            icon={<IconCalendarEvent size={20} color={muted} />}
            label="Starts"
            clearable={false}
            value={semester.startDate}
            readOnly={readOnly}
            onChange={(startDate) => startDate && update.mutate({ startDate })}
          />
          <DayProperty
            icon={<IconCalendarEvent size={20} color={muted} />}
            label="Ends"
            clearable={false}
            value={semester.endDate}
            readOnly={readOnly}
            onChange={(endDate) => endDate && update.mutate({ endDate })}
          />
        </PropertyList>
        {!readOnly ? (
          <View className="flex-row flex-wrap gap-2">
            <Button
              label={semester.isCurrent ? "This Is the Current Semester" : "Make Current"}
              variant="secondary"
              disabled={semester.isCurrent}
              status={statusOf(current)}
              errorLabel="Couldn't change it"
              onPress={() => current.mutate(undefined)}
            />
            <Button
              label="Open Notes"
              variant="ghost"
              status={statusOf(notes)}
              errorLabel="Couldn't open them"
              onPress={() =>
                notes.mutate(undefined, { onSuccess: (note) => router.push(`/entity/${note}`) })
              }
            />
          </View>
        ) : null}
      </DetailsPart>
    </>
  );
}

/// Which of the courses run in this semester.
function useSemesterMembers(semesterId: string, courseIds: string[]) {
  const db = useDb();
  return useQuery({
    queryKey: ["local", "semester-members", semesterId, courseIds.join(",")],
    queryFn: async () => {
      const found: string[] = [];
      for (const id of courseIds) if ((await courseSemester(db, id)) === semesterId) found.push(id);
      return found;
    },
  });
}

/// The semester a course runs in, chosen from the Space's semesters, as a row of its card.
export function CourseSemesterPicker({
  courseId,
  spaceId,
  readOnly,
}: {
  courseId: string;
  spaceId: string;
  readOnly: boolean;
}) {
  const theme = useTheme();
  const { data: semesters = [] } = useSemesters(spaceId);
  const { data: current } = useCourseSemester(courseId);
  const set = useLocalWrite((db, semesterId: string | null) =>
    setCourseSemester(db, courseId, semesterId),
  );
  if (semesters.length === 0) return null;
  return (
    <ChoiceProperty
      icon={<IconCalendarWeek size={20} color={theme.colors.mutedForeground} />}
      label="Semester"
      value={current ?? "none"}
      readOnly={readOnly}
      options={[
        { id: "none", label: "None" },
        // Each with its icon, when it runs and whether it is the current one, as the
        // desktop's picker shows a semester.
        ...semesters.map((s) => ({
          id: s.entity.id,
          label: s.entity.title || "Untitled",
          glyph: IconCalendarWeek,
          tint: "blue",
          subtitle: semesterRange(s) ?? s.entity.key,
          detail: s.isCurrent ? "Current" : undefined,
        })),
      ]}
      onChange={(id) => set.mutate(id === "none" ? null : id)}
    />
  );
}

/// New Semester: a term system and region give the title and dates, which can be changed.
export function NewSemesterScreen({ spaceId }: { spaceId?: string }) {
  const router = useRouter();
  const close = useCloseSheet();
  const { data: spaces = [] } = useSpaces();
  const [chosen, setChosen] = useState<string | null>(spaceId ?? null);
  const space = chosen ?? spaces[0]?.id ?? null;
  const [system, setSystem] = useState<AcademicSystemKey>("winter_summer");
  const guess = guessCurrentTerm(system);
  const [termKey, setTermKey] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const def = ACADEMIC_SYSTEMS[system];
  const term = def.terms.find((t) => t.key === (termKey ?? guess.term.key)) ?? guess.term;
  const theYear = year ?? guess.year;
  const regions = REGION_TERM_DATES.filter((r) => r.system === system);
  const window = regions.find((r) => r.key === region)?.windows[term.key];
  const dates = window ? resolveTermDates(window, theYear) : null;
  const create = useLocalWrite((db, _: undefined) => {
    if (!space) throw new Error("Pick a Space");
    return createSemester(db, space, {
      title: def.formatTitle(term, theYear),
      termType: term.key,
      year: theYear,
      startDate: dates?.startDate ?? null,
      endDate: dates?.endDate ?? null,
    });
  });
  const submit = () =>
    create.mutate(undefined, { onSuccess: (id) => close(() => router.push(`/entity/${id}`)) });
  return (
    <Screen>
      <FormSection>
        <SpacePicker value={space} onChange={setChosen} />
        <SelectField
          label="Term system"
          value={system}
          options={ACADEMIC_SYSTEM_KEYS.map((key) => ({
            id: key,
            label: ACADEMIC_SYSTEMS[key].label,
          }))}
          onChange={(key) => {
            setSystem(key);
            setTermKey(null);
            setRegion(null);
          }}
        />
        <SelectField
          label="Term"
          value={term.key}
          options={def.terms.map((t) => ({ id: t.key, label: t.label }))}
          onChange={setTermKey}
        />
        <ChipGroup label="Year">
          {[theYear - 1, theYear, theYear + 1].map((y) => (
            <Chip key={y} label={String(y)} selected={y === theYear} onPress={() => setYear(y)} />
          ))}
        </ChipGroup>
        <SelectField
          label="Typical dates for"
          value={region ?? "none"}
          options={[
            { id: "none", label: "No dates" },
            ...regions.map((r) => ({ id: r.key, label: r.label })),
          ]}
          onChange={(key) => setRegion(key === "none" ? null : key)}
        />
      </FormSection>
      <Text tone="muted">
        {def.formatTitle(term, theYear)}
        {dates ? `, ${dayLabel(dates.startDate)} to ${dayLabel(dates.endDate)}` : ""}
      </Text>
      {create.error ? <Text tone="destructive">{create.error.message}</Text> : null}
      <Button
        label="New Semester"
        status={statusOf(create)}
        errorLabel="Couldn't create"
        onPress={submit}
      />
    </Screen>
  );
}

/// The semester at a glance, rolled up across its courses: sessions this week, exams in the
/// next 7 days and assignments still open.
function SemesterStats({ spaceId, courseIds }: { spaceId: string; courseIds: string[] }) {
  const { data: sessions = [] } = useSessions({ spaceId });
  const { data: exams = [] } = useExams({ spaceId });
  const { data: assignments = [] } = useAssignments({ spaceId });
  const today = localDay();
  const weekEnd = addDays(today, 6);
  const horizon = addDays(today, 7);
  const mine = new Set(courseIds);
  const week = sessions.filter(
    (s) =>
      s.courseId && mine.has(s.courseId) && !s.cancelled && s.date >= today && s.date <= weekEnd,
  ).length;
  const coming = exams.filter(
    (e) =>
      e.courseId &&
      mine.has(e.courseId) &&
      e.status !== "done" &&
      e.examDate &&
      e.examDate >= today &&
      e.examDate <= horizon,
  ).length;
  const open = assignments.filter(
    (a) =>
      a.courseId && mine.has(a.courseId) && a.status !== "submitted" && a.status !== "evaluated",
  ).length;
  const stat = (value: number, label: string) => (
    <View className="flex-1 items-center gap-0.5 rounded-lg border border-border p-3">
      <Text className="font-heading text-2xl">{value}</Text>
      <Text variant="small" tone="muted" className="text-center">
        {label}
      </Text>
    </View>
  );
  return (
    <View className="flex-row gap-2">
      {stat(week, "sessions this week")}
      {stat(coming, "upcoming exams")}
      {stat(open, "open assignments")}
    </View>
  );
}

/// Takes a course that has no semester yet into this one, or makes a new one and links it.
function AddCourse({
  semesterId,
  spaceId,
  unassigned,
}: {
  semesterId: string;
  spaceId: string;
  unassigned: { entity: { id: string; title: string } }[];
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const link = useLocalWrite((db, courseId: string) => setCourseSemester(db, courseId, semesterId));
  const create = useLocalWrite(async (db, title: string) => {
    const course = await createCourse(db, spaceId, title);
    await setCourseSemester(db, course, semesterId);
  });
  return (
    <View className="items-start">
      <Button
        label="Add Course"
        variant="secondary"
        icon={<IconPlus size={16} color={theme.colors.foreground} />}
        onPress={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen} title="Add Course" presentation="card">
        <OptionList
          label="Courses without a semester"
          search
          searchPlaceholder="Find a course or name a new one"
          options={unassigned.map((c) => ({
            id: c.entity.id,
            label: c.entity.title || "Untitled",
          }))}
          value={null}
          onChange={(id) => link.mutate(id)}
          onCreate={(title) => create.mutate(title, { onSuccess: () => setOpen(false) })}
        />
      </Sheet>
    </View>
  );
}

/// The Jot and the Note written for this session: each opens, or is made on the spot.
function SessionPages({ sessionId, readOnly }: { sessionId: string; readOnly: boolean }) {
  return (
    <View className="gap-3">
      <SessionPageCard sessionId={sessionId} kind="jot" readOnly={readOnly} />
      <SessionPageCard sessionId={sessionId} kind="note" readOnly={readOnly} />
    </View>
  );
}

function SessionPageCard({
  sessionId,
  kind,
  readOnly,
}: {
  sessionId: string;
  kind: "jot" | "note";
  readOnly: boolean;
}) {
  const router = useRouter();
  const { data: page } = useSessionPage(sessionId, kind);
  const make = useLocalWrite((db, _: undefined) => createSessionPage(db, sessionId, kind));
  const noun = kind === "jot" ? "Jot" : "Note";
  if (page) {
    return (
      <Section title={noun}>
        <Row
          title={page.title || `Untitled ${noun}`}
          subtitle={page.key}
          icon={<EntityIcon type={kind} icon={page.icon} />}
          onPress={() => router.push(`/entity/${page.id}`)}
        />
      </Section>
    );
  }
  if (readOnly) return null;
  return (
    <View className="items-start">
      <Button
        label={`Create ${noun} for This Session`}
        variant="secondary"
        status={statusOf(make)}
        errorLabel="Couldn't create it"
        onPress={() => make.mutate(undefined, { onSuccess: (id) => router.push(`/entity/${id}`) })}
      />
    </View>
  );
}
