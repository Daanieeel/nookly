import {
  ACADEMIC_SYSTEMS,
  ACADEMIC_SYSTEM_KEYS,
  type AcademicSystemKey,
  REGION_TERM_DATES,
  guessCurrentTerm,
  resolveTermDates,
} from "@nookly/shared/academic";
import {
  type SemesterRecord,
  createOneOffSession,
  createSemester,
  courseSemester,
  createStudyBlock,
  getOrCreateSemesterNotes,
  overrideSession,
  setCourseSemester,
  setCurrentSemester,
  updateSemester,
  updateStudyBlock,
} from "@nookly/shared/data";
import { IconCalendarEvent, IconClock, IconMapPin, IconPlus } from "@tabler/icons-react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useDb, useLocalWrite } from "../data/context.tsx";
import {
  useCourseSemester,
  useCourses,
  useExam,
  useSemester,
  useSemesters,
  useSessions,
  useSession,
  useSpaces,
  useStudyBlock,
  useStudyBlocks,
} from "../data/queries.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { DateField } from "../ui/DateField.tsx";
import { Field } from "../ui/Field.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { DetailsPart, MainPart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { ChoiceProperty, DayProperty, TextRow } from "../ui/property-rows.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { CoursePicker } from "./StudyPickers.tsx";
import { SpacePicker } from "./SpacePicker.tsx";
import { dayLabel, localDay } from "./dates.ts";
import { PageEditor } from "./PageEditor.tsx";

/// Sessions, study blocks, semesters and grades: what a student plans and is graded on.

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/// "9:00 to 10:30".
const span = (start: string, end: string) => `${start} to ${end}`;

// --- sessions -------------------------------------------------------------------------

/// A Space's sessions from today on, then the past ones, by day and time.
export function SessionRows({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const { data: sessions = [] } = useSessions({ spaceId });
  const today = localDay();
  const upcoming = sessions.filter((s) => s.date >= today);
  const past = sessions.filter((s) => s.date < today).reverse();
  const rows = (list: typeof sessions) =>
    list.map((s) => (
      <View key={s.entity.id}>
        <Row
          title={s.entity.title || s.courseTitle || "Session"}
          subtitle={join(
            dayLabel(s.date, today),
            span(s.startTime, s.endTime),
            s.location,
            s.cancelled ? "Cancelled" : null,
          )}
          muted={s.cancelled}
          icon={<EntityIcon type="session" icon={s.entity.icon} />}
          onPress={() => router.push(`/entity/${s.entity.id}`)}
        />
      </View>
    ));
  return (
    <>
      <Section title="Coming up">
        {upcoming.length === 0 ? <Empty text="No sessions coming up." /> : rows(upcoming)}
      </Section>
      {past.length > 0 ? <Section title="Earlier">{rows(past)}</Section> : null}
    </>
  );
}

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
  return (
    <>
      <MainPart>
        <SessionNotes
          value={session.notes}
          readOnly={readOnly}
          onSave={(notes) => patch.mutate({ notes })}
        />
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
          <PropertyList>
            <DayProperty
              name="day"
              icon={<IconCalendarEvent size={20} color={muted} />}
              label="Day"
              clearable={false}
              value={session.date}
              readOnly={readOnly}
              onChange={(date) => date && patch.mutate({ date })}
            />
            <DayProperty
              name="starts"
              icon={<IconClock size={20} color={muted} />}
              label="Starts"
              mode="time"
              clearable={false}
              value={session.startTime}
              readOnly={readOnly}
              onChange={(startTime) => startTime && patch.mutate({ startTime })}
            />
            <DayProperty
              name="ends"
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
              placeholder="Room 5"
              onSave={(location) => patch.mutate({ location })}
            />
          </PropertyList>
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
export function NewSessionScreen({ spaceId, courseId }: { spaceId?: string; courseId?: string }) {
  const router = useRouter();
  const { data: spaces = [] } = useSpaces();
  const [chosen, setChosen] = useState<string | null>(spaceId ?? null);
  const space = chosen ?? spaces[0]?.id ?? null;
  const [course, setCourse] = useState<string | null>(courseId ?? null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(localDay());
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:30");
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
    create.mutate(undefined, { onSuccess: (id) => router.replace(`/entity/${id}`) });
  return (
    <Screen>
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
      <View className="flex-row gap-3">
        <View className="flex-1">
          <DateField
            label="Starts"
            mode="time"
            clearable={false}
            value={start}
            onChange={(t) => t && setStart(t)}
          />
        </View>
        <View className="flex-1">
          <DateField
            label="Ends"
            mode="time"
            clearable={false}
            value={end}
            onChange={(t) => t && setEnd(t)}
          />
        </View>
      </View>
      <Field label="Where" placeholder="Room 5" value={where} onChangeText={setWhere} />
      {create.error ? <Text tone="destructive">{create.error.message}</Text> : null}
      <Button
        label="New Session"
        status={statusOf(create)}
        errorLabel="Couldn't create"
        onPress={submit}
      />
    </Screen>
  );
}

// --- study blocks ---------------------------------------------------------------------

/// The time set aside for an exam, with a way to add some.
export function ExamStudyBlocks({
  examId,
  spaceId,
  readOnly,
}: {
  examId: string;
  spaceId: string;
  readOnly: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { data: blocks = [] } = useStudyBlocks({ examId });
  return (
    <Section
      title="Study blocks"
      action={
        readOnly ? undefined : (
          <IconButton
            label="New Study Block"
            icon={<IconPlus size={18} color={theme.colors.mutedForeground} />}
            onPress={() => router.push(`/new/study-block?spaceId=${spaceId}&examId=${examId}`)}
          />
        )
      }
    >
      {blocks.length === 0 ? <Empty text="No study blocks yet." /> : null}
      {blocks.map((b) => (
        <View key={b.entity.id}>
          <Row
            title={b.entity.title || "Study block"}
            subtitle={join(dayLabel(b.date), span(b.startTime, b.endTime))}
            icon={<EntityIcon type="study_block" icon={b.entity.icon} />}
            onPress={() => router.push(`/entity/${b.entity.id}`)}
          />
        </View>
      ))}
    </Section>
  );
}

export function StudyBlockDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  const router = useRouter();
  const { data: block } = useStudyBlock(id);
  const { data: exam } = useExam(block?.examId ?? "");
  const patch = useLocalWrite((db, p: Parameters<typeof updateStudyBlock>[2]) =>
    updateStudyBlock(db, id, p),
  );
  if (!block) return null;
  return (
    <>
      <MainPart>
        <PageEditor entityId={id} readOnly={readOnly} live={false} />
        {exam ? (
          <Section>
            <Row
              title={exam.entity.title || "Exam"}
              subtitle="Exam"
              icon={<EntityIcon type="exam" />}
              onPress={() => router.push(`/entity/${exam.entity.id}`)}
            />
          </Section>
        ) : null}
      </MainPart>
      <DetailsPart>
        <PropertyList>
          <DayProperty
            name="day"
            icon={<IconCalendarEvent size={20} color={muted} />}
            label="Day"
            clearable={false}
            value={block.date}
            readOnly={readOnly}
            onChange={(date) => date && patch.mutate({ date })}
          />
          <DayProperty
            name="starts"
            icon={<IconClock size={20} color={muted} />}
            label="Starts"
            mode="time"
            clearable={false}
            value={block.startTime}
            readOnly={readOnly}
            onChange={(startTime) => startTime && patch.mutate({ startTime })}
          />
          <DayProperty
            name="ends"
            icon={<IconClock size={20} color={muted} />}
            label="Ends"
            mode="time"
            clearable={false}
            value={block.endTime}
            readOnly={readOnly}
            onChange={(endTime) => endTime && patch.mutate({ endTime })}
          />
        </PropertyList>
        {patch.error ? <Text tone="destructive">{patch.error.message}</Text> : null}
      </DetailsPart>
    </>
  );
}

export function NewStudyBlockScreen({ spaceId, examId }: { spaceId?: string; examId?: string }) {
  const router = useRouter();
  const { data: exam } = useExam(examId ?? "");
  const space = spaceId ?? exam?.entity.spaceId;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(localDay());
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("16:00");
  const create = useLocalWrite((db, _: undefined) => {
    if (!space || !examId) throw new Error("Pick an exam for the study block.");
    return createStudyBlock(db, space, {
      title: title.trim() || "Study",
      examId,
      date,
      startTime: start,
      endTime: end,
    });
  });
  const submit = () =>
    create.mutate(undefined, { onSuccess: (id) => router.replace(`/entity/${id}`) });
  return (
    <Screen>
      {exam ? <Text tone="muted">For {exam.entity.title || "the exam"}</Text> : null}
      <Field label="Title" placeholder="Revise graphs" value={title} onChangeText={setTitle} />
      <DateField label="Day" clearable={false} value={date} onChange={(d) => d && setDate(d)} />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <DateField
            label="Starts"
            mode="time"
            clearable={false}
            value={start}
            onChange={(t) => t && setStart(t)}
          />
        </View>
        <View className="flex-1">
          <DateField
            label="Ends"
            mode="time"
            clearable={false}
            value={end}
            onChange={(t) => t && setEnd(t)}
          />
        </View>
      </View>
      {create.error ? <Text tone="destructive">{create.error.message}</Text> : null}
      <Button
        label="New Study Block"
        status={statusOf(create)}
        errorLabel="Couldn't create"
        onPress={submit}
      />
    </Screen>
  );
}

// --- semesters ------------------------------------------------------------------------

function semesterSubtitle(s: SemesterRecord): string {
  const term =
    s.termType && s.year !== null
      ? `${s.termType[0].toUpperCase()}${s.termType.slice(1)} ${s.year}`
      : null;
  const dates =
    s.startDate && s.endDate ? `${dayLabel(s.startDate)} to ${dayLabel(s.endDate)}` : null;
  return join(term, dates);
}

/// A Space's semesters in the order the desktop shows them, the current one marked.
export function SemesterRows({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const { data: semesters = [] } = useSemesters(spaceId);
  return (
    <Section>
      {semesters.length === 0 ? <Empty text="No semesters yet." /> : null}
      {semesters.map((s) => (
        <View key={s.entity.id}>
          <Row
            title={s.entity.title || "Untitled"}
            subtitle={semesterSubtitle(s)}
            icon={<EntityIcon type="semester" icon={s.entity.icon} />}
            trailing={s.isCurrent ? <Badge label="Current" variant="positive" /> : null}
            onPress={() => router.push(`/entity/${s.entity.id}`)}
          />
        </View>
      ))}
    </Section>
  );
}

/// A semester: its dates, whether it is the current one, its notes and its courses.
export function SemesterDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
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
                />
              </View>
            ))}
        </Section>
      </MainPart>
      <DetailsPart>
        <PropertyList>
          <DayProperty
            name="starts"
            icon={<IconCalendarEvent size={20} color={muted} />}
            label="Starts"
            clearable={false}
            value={semester.startDate}
            readOnly={readOnly}
            onChange={(startDate) => startDate && update.mutate({ startDate })}
          />
          <DayProperty
            name="ends"
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
      name="semester"
      icon={<IconCalendarEvent size={20} color={theme.colors.mutedForeground} />}
      label="Semester"
      value={current ?? "none"}
      readOnly={readOnly}
      options={[
        { id: "none", label: "None" },
        ...semesters.map((s) => ({ id: s.entity.id, label: s.entity.title || "Untitled" })),
      ]}
      onChange={(id) => set.mutate(id === "none" ? null : id)}
    />
  );
}

/// New Semester: a term system and region give the title and dates, which can be changed.
export function NewSemesterScreen({ spaceId }: { spaceId?: string }) {
  const router = useRouter();
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
    create.mutate(undefined, { onSuccess: (id) => router.replace(`/entity/${id}`) });
  return (
    <Screen>
      <SpacePicker value={space} onChange={setChosen} />
      <ChipGroup label="Term system">
        {ACADEMIC_SYSTEM_KEYS.map((key) => (
          <Chip
            key={key}
            label={ACADEMIC_SYSTEMS[key].label}
            selected={system === key}
            onPress={() => {
              setSystem(key);
              setTermKey(null);
              setRegion(null);
            }}
          />
        ))}
      </ChipGroup>
      <ChipGroup label="Term">
        {def.terms.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            selected={t.key === term.key}
            onPress={() => setTermKey(t.key)}
          />
        ))}
      </ChipGroup>
      <ChipGroup label="Year">
        {[theYear - 1, theYear, theYear + 1].map((y) => (
          <Chip key={y} label={String(y)} selected={y === theYear} onPress={() => setYear(y)} />
        ))}
      </ChipGroup>
      <ChipGroup label="Typical dates for">
        <Chip label="No dates" selected={region === null} onPress={() => setRegion(null)} />
        {regions.map((r) => (
          <Chip
            key={r.key}
            label={r.label}
            selected={r.key === region}
            onPress={() => setRegion(r.key)}
          />
        ))}
      </ChipGroup>
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
