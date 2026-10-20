import {
  DUPLICATE_TYPES,
  PORTABLE_TYPES,
  type EntityRecord,
  type RepeatRule,
  createSubtask,
  exportNooklyFile,
  nooklyFileNoun,
  duplicateEntity,
  markOpened,
  renameEntity,
  restoreEntity,
  setPinned,
  setTaskDates,
  setTaskEffort,
  setTaskRepeat,
  setTaskStatus,
  trashEntity,
} from "@nookly/shared/data";
import { EFFORT_STEPS, effortLabel } from "@nookly/shared/effort";
import { SHAREABLE_TYPES, isSharedSpace } from "@nookly/shared/api";
import {
  IconCalendarDue,
  IconCalendarPlus,
  IconCircleDot,
  IconDots,
  IconGauge,
  IconPlus,
  IconRepeat,
} from "@tabler/icons-react-native";
import { File, Paths } from "expo-file-system";
import { Stack, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { EditorToolbar } from "../editor/EditorToolbar.tsx";
import { useAppData, useLocalWrite, useSyncState } from "../data/context.tsx";
import { useSetting } from "../data/settings.ts";
import {
  useEntity,
  useSpaces,
  useStatuses,
  useSubtaskProgress,
  useSubtasks,
  useTask,
} from "../data/queries.ts";
import { Badge, SpaceDot } from "../ui/Badge.tsx";
import { DatePanel, openAndroidPicker, shownValue } from "../ui/DateField.tsx";
import { Property, PropertyList } from "../ui/Property.tsx";
import { useTheme } from "../ui/theme.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { ConflictBadge } from "./ConflictBadge.tsx";
import { DetailsDrawer, useDetails } from "../shell/DetailsDrawer.tsx";
import { useInspectorShown } from "../ui/pane.tsx";
import { LabelsProperty } from "./RelatedSection.tsx";
import { useReadOnly } from "./useReadOnly.ts";
import { AssignmentDetail, CourseDetail, DeckDetail, ExamDetail } from "./StudyDetail.tsx";
import { BookmarkDetail } from "./BookmarkDetail.tsx";
import { CalendarEntryDetail } from "./CalendarEntryDetail.tsx";
import { addDays, localDay } from "./dates.ts";
import { FileDetail } from "./FileScreens.tsx";
import { PageEditor } from "./PageEditor.tsx";
import { SemesterDetail, SessionDetail, StudyBlockDetail } from "./PlannerScreens.tsx";
import { RecipeDetail } from "./RecipeScreens.tsx";
import { StatusIcon, TaskRow } from "./TaskRow.tsx";
import { useClipboard } from "../ui/clipboard.tsx";
import { type MenuItem, useMenu } from "../ui/menu.tsx";

function TitleField({ entity, readOnly }: { entity: EntityRecord; readOnly: boolean }) {
  const [title, setTitle] = useState(entity.title);
  useEffect(() => setTitle(entity.title), [entity.title]);
  const rename = useLocalWrite((db, next: string) => renameEntity(db, entity.id, next));
  return (
    <TextInput
      accessibilityLabel="Title"
      value={title}
      editable={!readOnly}
      placeholder="Untitled"
      onChangeText={setTitle}
      onEndEditing={() => title !== entity.title && rename.mutate(title.trim())}
      multiline
      className="p-0 font-heading text-xl text-foreground placeholder:text-muted-foreground"
    />
  );
}

/// What the "more" button of an open item offers: pin, share, move, duplicate, save, trash;
/// or restore for an item in the Trash.
function useEntityMenu(entity: EntityRecord): MenuItem[] {
  const router = useRouter();
  const details = useDetails();
  const clipboard = useClipboard();
  const signedIn = useSyncState((s) => s.user !== null);
  const shareable =
    SHAREABLE_TYPES.some((t) => t === entity.type) && !isSharedSpace(entity.spaceId);
  const pin = useLocalWrite((db, next: boolean) => setPinned(db, entity.id, next));
  const trash = useLocalWrite((db) => trashEntity(db, entity.id));
  const restore = useLocalWrite((db) => restoreEntity(db, entity.id));
  const copy = useLocalWrite((db) => duplicateEntity(db, entity.id));
  const saveFile = useLocalWrite(async (db, _: undefined) => {
    const { filename, text } = await exportNooklyFile(db, entity.id);
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: filename });
    }
  });
  if (entity.deletedAt) {
    return [{ label: "Restore", onPress: () => restore.mutate(undefined) }];
  }
  const items: MenuItem[] = [];
  if (details) items.push({ label: "Show Details", onPress: () => details.show() });
  if (signedIn && shareable) {
    items.push({ label: "Share", onPress: () => router.push(`/new/share?entityId=${entity.id}`) });
  }
  // As the desktop copies it: pasted into a page, it becomes a mention of this item.
  items.push({
    label: "Copy Link",
    onPress: () => void clipboard.copy(`[${entity.title || entity.key}](mention:${entity.id})`),
  });
  items.push({ label: entity.pinned ? "Unpin" : "Pin", onPress: () => pin.mutate(!entity.pinned) });
  items.push({
    label: "Change Icon",
    onPress: () =>
      router.push({ pathname: "/pick/icon", params: { kind: "entity", id: entity.id } }),
  });
  if (entity.type !== "sub_task" && !isSharedSpace(entity.spaceId)) {
    items.push({
      label: "Move to Space",
      onPress: () => router.push(`/new/move?entityId=${entity.id}`),
    });
  }
  if (DUPLICATE_TYPES.includes(entity.type) && !isSharedSpace(entity.spaceId)) {
    items.push({
      label: "Duplicate",
      onPress: () => copy.mutate(undefined, { onSuccess: (id) => router.replace(`/entity/${id}`) }),
    });
  }
  if (PORTABLE_TYPES.includes(entity.type)) {
    items.push({
      label: `Save as Nookly ${nooklyFileNoun(entity.type)}`,
      onPress: () => saveFile.mutate(undefined),
    });
  }
  items.push({ label: "Move to Trash", destructive: true, onPress: () => trash.mutate(undefined) });
  return items;
}

const REPEATS: { label: string; rule: RepeatRule | null }[] = [
  { label: "Never", rule: null },
  { label: "Daily", rule: { every: 1, unit: "day" } },
  { label: "Weekly", rule: { every: 1, unit: "week" } },
  { label: "Monthly", rule: { every: 1, unit: "month" } },
];

/// A task's sub-tasks, one level deep, with how far along they are.
function Subtasks({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const { data: subtasks = [] } = useSubtasks(id);
  const { data: statuses = [] } = useStatuses();
  const { data: progress } = useSubtaskProgress(id);
  const [title, setTitle] = useState("");
  const add = useLocalWrite((db, text: string) => createSubtask(db, id, text));
  const submit = () => {
    const text = title.trim();
    if (text) add.mutate(text, { onSuccess: () => setTitle("") });
  };
  return (
    <Section
      title="Sub-tasks"
      action={
        progress === null || progress === undefined ? undefined : (
          <Text variant="small" tone="muted">
            {Math.round(progress)}% done
          </Text>
        )
      }
    >
      {subtasks.map((task) => (
        <View key={task.entity.id}>
          <TaskRow task={task} statuses={statuses} />
        </View>
      ))}
      {!readOnly ? (
        <View className="min-h-12 flex-row items-center gap-2 px-4">
          <IconPlus size={18} color={theme.colors.mutedForeground} />
          <TextInput
            accessibilityLabel="New sub-task"
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={submit}
            returnKeyType="done"
            placeholder="Add a sub-task"
            placeholderTextColor={theme.colors.mutedForeground}
            className="h-12 flex-1 font-sans text-sm text-foreground"
          />
          {title.trim() ? (
            <Button
              label="Add Sub-task"
              variant="secondary"
              size="sm"
              status={statusOf(add)}
              errorLabel="Couldn't add"
              onPress={submit}
            />
          ) : null}
        </View>
      ) : null}
    </Section>
  );
}

/// A day property: its row opens the system's calendar (iPhone: below the row), with the
/// quick picks and Clear.
function DateProperty({
  icon,
  label,
  value,
  readOnly,
  open,
  onOpen,
  onChange,
  quick = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  readOnly: boolean;
  open: boolean;
  onOpen: () => void;
  onChange: (day: string | null) => void;
  quick?: boolean;
}) {
  const press = () => {
    if (Platform.OS === "android") openAndroidPicker("date", value, onChange);
    else onOpen();
  };
  return (
    <Property
      icon={icon}
      label={label}
      value={value ? shownValue("date", value) : "None"}
      disabled={readOnly}
      expanded={open}
      onPress={press}
    >
      <DatePanel label={label} mode="date" value={value} onPick={onChange} onClose={onOpen} />
      <View className="flex-row flex-wrap gap-2">
        {quick ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              label="Today"
              onPress={() => onChange(localDay())}
            />
            <Button
              variant="secondary"
              size="sm"
              label="Tomorrow"
              onPress={() => onChange(addDays(localDay(), 1))}
            />
          </>
        ) : null}
        {value ? (
          <Button
            variant="ghost"
            size="sm"
            label={`Clear ${label}`}
            onPress={() => onChange(null)}
          />
        ) : null}
      </View>
    </Property>
  );
}

/// A task's properties, one card of rows: tap a row to change it.
function TaskDetail({
  id,
  readOnly,
  labels,
}: {
  id: string;
  readOnly: boolean;
  /// The labels row, when it belongs in this card.
  labels?: React.ReactNode;
}) {
  const theme = useTheme();
  const { data: task } = useTask(id);
  const { data: statuses = [] } = useStatuses();
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (name: string) => setOpen((now) => (now === name ? null : name));
  const status = useLocalWrite((db, statusId: string) => setTaskStatus(db, id, statusId));
  const dates = useLocalWrite((db, due: string | null) =>
    setTaskDates(db, id, task?.startDate ?? null, due),
  );
  const start = useLocalWrite((db, day: string | null) =>
    setTaskDates(db, id, day, task?.dueDate ?? null),
  );
  const effort = useLocalWrite((db, value: number | null) => setTaskEffort(db, id, value));
  const [scale] = useSetting("general.effortScale");
  const repeat = useLocalWrite((db, rule: RepeatRule | null) => setTaskRepeat(db, id, rule));
  if (!task) return null;
  const current = statuses.find((s) => s.id === task.statusId);
  const muted = theme.colors.mutedForeground;
  const repeatLabel =
    REPEATS.find((r) => JSON.stringify(r.rule) === JSON.stringify(task.repeat))?.label ?? "Custom";
  return (
    <PropertyList>
      <Property
        icon={<IconCircleDot size={20} color={muted} />}
        label="Status"
        value={current?.name ?? ""}
        valueIcon={current ? <StatusIcon status={current} size={16} /> : undefined}
        disabled={readOnly}
        expanded={open === "status"}
        onPress={() => toggle("status")}
      >
        <ChipGroup label="Status">
          {statuses.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              selected={s.id === task.statusId}
              icon={<StatusIcon status={s} size={16} />}
              onPress={() => {
                if (s.id !== task.statusId) status.mutate(s.id);
                setOpen(null);
              }}
            />
          ))}
        </ChipGroup>
      </Property>
      <Property
        icon={<IconGauge size={20} color={muted} />}
        label="Effort"
        value={task.effort === null ? "None" : effortLabel(task.effort, scale)}
        disabled={readOnly}
        expanded={open === "effort"}
        onPress={() => toggle("effort")}
      >
        <ChipGroup label="Effort">
          <Chip
            label="None"
            selected={task.effort === null}
            onPress={() => {
              effort.mutate(null);
              setOpen(null);
            }}
          />
          {EFFORT_STEPS.map((step) => (
            <Chip
              key={step.value}
              label={effortLabel(step.value, scale)}
              selected={task.effort === step.value}
              onPress={() => {
                effort.mutate(step.value);
                setOpen(null);
              }}
            />
          ))}
        </ChipGroup>
      </Property>
      <DateProperty
        icon={<IconCalendarPlus size={20} color={muted} />}
        label="Start date"
        value={task.startDate}
        readOnly={readOnly}
        open={open === "start"}
        onOpen={() => toggle("start")}
        onChange={(day) => start.mutate(day)}
      />
      <DateProperty
        icon={<IconCalendarDue size={20} color={muted} />}
        label="Due date"
        value={task.dueDate}
        readOnly={readOnly}
        open={open === "due"}
        onOpen={() => toggle("due")}
        onChange={(day) => dates.mutate(day)}
        quick
      />
      <Property
        icon={<IconRepeat size={20} color={muted} />}
        label="Repeat"
        value={repeatLabel}
        disabled={readOnly}
        expanded={open === "repeat"}
        onPress={() => toggle("repeat")}
      >
        <ChipGroup label="Repeat">
          {REPEATS.map((r) => (
            <Chip
              key={r.label}
              label={r.label}
              selected={JSON.stringify(r.rule) === JSON.stringify(task.repeat)}
              onPress={() => {
                repeat.mutate(r.rule);
                setOpen(null);
              }}
            />
          ))}
        </ChipGroup>
      </Property>
      {labels}
    </PropertyList>
  );
}

/// One entity, as its own type shows it. Every type gets its title, Space, key and the
/// "more" menu (pin, move, trash and so on); tasks, pages, bookmarks and calendar entries
/// also their own fields.
export function EntityScreen({ id }: { id: string }) {
  const { db } = useAppData();
  const { data: entity, isLoading } = useEntity(id);
  // Beside the page on a wide iPad; else behind it, a swipe away.
  const inspector = useInspectorShown();
  useEffect(() => {
    void markOpened(db, id);
  }, [db, id]);
  if (isLoading) return null;
  if (!entity) {
    return (
      <Screen>
        <Text tone="muted">This item isn't on this device.</Text>
      </Screen>
    );
  }
  return inspector ? (
    <OpenEntity entity={entity} />
  ) : (
    <DetailsDrawer id={entity.id} labels={entity.type !== "task" && entity.type !== "sub_task"}>
      <OpenEntity entity={entity} />
    </DetailsDrawer>
  );
}

function OpenEntity({ entity }: { entity: EntityRecord }) {
  const id = entity.id;
  const { data: spaces = [] } = useSpaces();
  const readOnly = useReadOnly(entity);
  const theme = useTheme();
  const present = useMenu();
  const menu = useEntityMenu(entity);
  const inspector = useInspectorShown();
  // The task's own card keeps its labels row, unless the details beside the page hold them.
  const space = spaces.find((s) => s.id === entity.spaceId);
  // Labels and links belong to a Space of your own, not to one shared with you, and the
  // details pane takes them when it is beside the page.
  const withLabels = !(entity.deletedAt || isSharedSpace(entity.spaceId) || inspector);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <Stack.Screen options={{ title: "" }} />
      <Screen>
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="small" tone="muted">
              {entity.key}
            </Text>
            {space ? <SpaceDot color={space.color} /> : null}
            <Text variant="small" tone="muted">
              {space?.name ?? ""}
            </Text>
            {entity.deletedAt ? <Badge label="In Trash" variant="destructive" /> : null}
            {readOnly && !entity.deletedAt ? <Badge label="View only" /> : null}
            <ConflictBadge entityId={entity.id} />
            <View className="flex-1" />
            {menu.length > 0 ? (
              <IconButton
                label="More"
                icon={<IconDots size={22} color={theme.colors.mutedForeground} />}
                onPress={() => present.show(entity.title || entity.key, menu)}
              />
            ) : null}
          </View>
          <TitleField entity={entity} readOnly={readOnly} />
        </View>
        {entity.type === "task" || entity.type === "sub_task" ? (
          <>
            <TaskDetail
              id={id}
              readOnly={readOnly}
              labels={
                withLabels ? <LabelsProperty entity={entity} readOnly={readOnly} /> : undefined
              }
            />
            {entity.type === "task" ? <Subtasks id={id} readOnly={readOnly} /> : null}
          </>
        ) : null}
        {entity.type === "note" || entity.type === "jot" ? (
          <PageEditor entityId={id} readOnly={readOnly} />
        ) : null}
        {entity.type === "file" ? <FileDetail id={id} /> : null}
        {entity.type === "session" ? <SessionDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "study_block" ? <StudyBlockDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "semester" ? <SemesterDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "recipe" ? <RecipeDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "bookmark" ? <BookmarkDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "calendar_entry" ? (
          <CalendarEntryDetail id={id} readOnly={readOnly} />
        ) : null}
        {entity.type === "course" ? <CourseDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "exam" ? <ExamDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "assignment" ? <AssignmentDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "index_card_deck" ? <DeckDetail id={id} readOnly={readOnly} /> : null}
      </Screen>
      <EditorToolbar />
    </KeyboardAvoidingView>
  );
}
