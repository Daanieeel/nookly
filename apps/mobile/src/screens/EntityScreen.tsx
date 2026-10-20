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
import { Button, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { DateField } from "../ui/DateField.tsx";
import { Field } from "../ui/Field.tsx";
import { Empty, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { ConflictBadge } from "./ConflictBadge.tsx";
import { useInspectorShown } from "../ui/pane.tsx";
import { LabelsSection, RelatedSection } from "./RelatedSection.tsx";
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

function Actions({ entity }: { entity: EntityRecord }) {
  const router = useRouter();
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
  return (
    <View className="flex-row flex-wrap gap-2">
      {entity.deletedAt ? (
        <Button
          variant="secondary"
          label="Restore"
          status={statusOf(restore)}
          errorLabel="Couldn't restore"
          onPress={() => restore.mutate(undefined)}
        />
      ) : (
        <>
          {signedIn && shareable ? (
            <Button
              label="Share"
              variant="ghost"
              onPress={() => router.push(`/new/share?entityId=${entity.id}`)}
            />
          ) : null}
          <Button
            label="Icon"
            variant="ghost"
            onPress={() =>
              router.push({ pathname: "/pick/icon", params: { kind: "entity", id: entity.id } })
            }
          />
          {entity.type !== "sub_task" && !isSharedSpace(entity.spaceId) ? (
            <Button
              label="Move to Space"
              variant="ghost"
              onPress={() => router.push(`/new/move?entityId=${entity.id}`)}
            />
          ) : null}
          {DUPLICATE_TYPES.includes(entity.type) && !isSharedSpace(entity.spaceId) ? (
            <Button
              label="Duplicate"
              variant="ghost"
              status={statusOf(copy)}
              errorLabel="Couldn't copy"
              onPress={() =>
                copy.mutate(undefined, { onSuccess: (id) => router.replace(`/entity/${id}`) })
              }
            />
          ) : null}
          {PORTABLE_TYPES.includes(entity.type) ? (
            <Button
              label={`Save as Nookly ${nooklyFileNoun(entity.type)}`}
              variant="ghost"
              status={statusOf(saveFile)}
              errorLabel="Couldn't save it"
              onPress={() => saveFile.mutate(undefined)}
            />
          ) : null}
          <Button
            label={entity.pinned ? "Unpin" : "Pin"}
            variant="ghost"
            status={statusOf(pin)}
            onPress={() => pin.mutate(!entity.pinned)}
          />
          <Button
            label="Move to Trash"
            variant="ghost"
            status={statusOf(trash)}
            errorLabel="Couldn't move it"
            onPress={() => trash.mutate(undefined)}
          />
        </>
      )}
    </View>
  );
}

const REPEATS: { label: string; rule: RepeatRule | null }[] = [
  { label: "Never", rule: null },
  { label: "Daily", rule: { every: 1, unit: "day" } },
  { label: "Weekly", rule: { every: 1, unit: "week" } },
  { label: "Monthly", rule: { every: 1, unit: "month" } },
];

/// A task's sub-tasks, one level deep, with how far along they are.
function Subtasks({ id, readOnly }: { id: string; readOnly: boolean }) {
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
      title={
        progress === null || progress === undefined
          ? "Sub-tasks"
          : `Sub-tasks, ${Math.round(progress)}% done`
      }
    >
      {subtasks.length === 0 ? <Empty text="No sub-tasks." /> : null}
      {subtasks.map((task) => (
        <View key={task.entity.id}>
          <TaskRow task={task} statuses={statuses} />
        </View>
      ))}
      {!readOnly ? (
        <View className="flex-row items-end gap-2 p-3">
          <View className="flex-1">
            <Field
              label="New sub-task"
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={submit}
              returnKeyType="done"
              placeholder="Add a sub-task"
            />
          </View>
          <Button
            label="Add Sub-task"
            variant="secondary"
            status={statusOf(add)}
            errorLabel="Couldn't add"
            onPress={submit}
          />
        </View>
      ) : null}
    </Section>
  );
}

function TaskDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const { data: task } = useTask(id);
  const { data: statuses = [] } = useStatuses();
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
  return (
    <>
      <Section title="Status">
        <View className="p-3">
          <ChipGroup label="Status">
            {statuses.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={s.id === task.statusId}
                disabled={readOnly}
                icon={<StatusIcon status={s} size={16} />}
                onPress={() => s.id !== task.statusId && status.mutate(s.id)}
              />
            ))}
          </ChipGroup>
        </View>
      </Section>
      <Section title="Effort">
        <View className="p-3">
          <ChipGroup label="Effort">
            <Chip
              label="None"
              selected={task.effort === null}
              disabled={readOnly}
              onPress={() => effort.mutate(null)}
            />
            {EFFORT_STEPS.map((step) => (
              <Chip
                key={step.value}
                label={effortLabel(step.value, scale)}
                selected={task.effort === step.value}
                disabled={readOnly}
                onPress={() => effort.mutate(step.value)}
              />
            ))}
          </ChipGroup>
        </View>
      </Section>
      <Section title="Start">
        <View className="p-3">
          <DateField
            label="Start date"
            value={task.startDate}
            readOnly={readOnly}
            onChange={(day) => start.mutate(day)}
          />
        </View>
      </Section>
      <Section title="Due">
        <View className="gap-2 p-3">
          <DateField
            label="Due date"
            value={task.dueDate}
            readOnly={readOnly}
            onChange={(day) => dates.mutate(day)}
          />
          {!readOnly ? (
            <View className="flex-row gap-2">
              <Button variant="secondary" label="Today" onPress={() => dates.mutate(localDay())} />
              <Button
                variant="secondary"
                label="Tomorrow"
                onPress={() => dates.mutate(addDays(localDay(), 1))}
              />
            </View>
          ) : null}
        </View>
      </Section>
      <Section title="Repeat">
        <View className="p-3">
          <ChipGroup label="Repeat">
            {REPEATS.map((r) => (
              <Chip
                key={r.label}
                label={r.label}
                disabled={readOnly}
                selected={JSON.stringify(r.rule) === JSON.stringify(task.repeat)}
                onPress={() => repeat.mutate(r.rule)}
              />
            ))}
          </ChipGroup>
        </View>
      </Section>
    </>
  );
}

/// One entity, as its own type shows it. Every type gets its title, Space, key, Pin
/// and Trash; Tasks, pages, bookmarks and calendar entries also their own fields.
export function EntityScreen({ id }: { id: string }) {
  const { db } = useAppData();
  const { data: entity, isLoading } = useEntity(id);
  const { data: spaces = [] } = useSpaces();
  const readOnly = useReadOnly(entity);
  // The details pane beside the page takes labels and links.
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
  const space = spaces.find((s) => s.id === entity.spaceId);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <Stack.Screen options={{ title: entity.key }} />
      <Screen>
        <View className="gap-2">
          <TitleField entity={entity} readOnly={readOnly} />
          <View className="flex-row items-center gap-2">
            {space ? <SpaceDot color={space.color} /> : null}
            <Text variant="small" tone="muted">
              {space?.name ?? ""}
            </Text>
            {entity.deletedAt ? <Badge label="In Trash" variant="destructive" /> : null}
            {readOnly && !entity.deletedAt ? <Badge label="View only" /> : null}
            <ConflictBadge entityId={entity.id} />
          </View>
        </View>
        {entity.type === "task" || entity.type === "sub_task" ? (
          <>
            <TaskDetail id={id} readOnly={readOnly} />
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
        {/* Labels and links belong to a Space of your own, not to one shared with you. */}
        {entity.deletedAt || isSharedSpace(entity.spaceId) || inspector ? null : (
          <>
            <LabelsSection entity={entity} readOnly={readOnly} />
            <RelatedSection entity={entity} readOnly={readOnly} />
          </>
        )}
        {!readOnly || entity.deletedAt ? <Actions entity={entity} /> : null}
      </Screen>
      <EditorToolbar />
    </KeyboardAvoidingView>
  );
}
