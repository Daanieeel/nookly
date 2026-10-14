import {
  type EntityRecord,
  type RepeatRule,
  markOpened,
  renameEntity,
  restoreEntity,
  setPinned,
  setTaskDates,
  setTaskRepeat,
  setTaskStatus,
  trashEntity,
} from "@nookly/shared/data";
import { useQuery } from "@tanstack/react-query";
import { SHAREABLE_TYPES, isSharedSpace } from "@nookly/shared/api";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { EditorToolbar } from "../editor/EditorToolbar.tsx";
import { useAppData, useLocalWrite, useSyncState } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { useEntity, useSpaces, useStatuses, useTask } from "../data/queries.ts";
import { Badge, SpaceDot } from "../ui/Badge.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { DateField } from "../ui/DateField.tsx";
import { Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { ConflictBadge } from "./ConflictBadge.tsx";
import { LabelsSection, RelatedSection } from "./RelatedSection.tsx";
import { AssignmentDetail, CourseDetail, DeckDetail, ExamDetail } from "./StudyDetail.tsx";
import { BookmarkDetail } from "./BookmarkDetail.tsx";
import { CalendarEntryDetail } from "./CalendarEntryDetail.tsx";
import { addDays, localDay } from "./dates.ts";
import { PageEditor } from "./PageEditor.tsx";
import { StatusIcon } from "./TaskRow.tsx";

/// A page someone shared to view only can't be changed here either.
function useReadOnly(entity: EntityRecord | null | undefined): boolean {
  const { sync } = useAppData();
  const shared = entity ? isSharedSpace(entity.spaceId) : false;
  const { data: role } = useQuery({
    queryKey: keys.role(entity?.id ?? ""),
    queryFn: () => sync.engine.roleOf(entity?.id ?? ""),
    enabled: shared,
  });
  return role === "viewer" || Boolean(entity?.deletedAt);
}

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

function TaskDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const { data: task } = useTask(id);
  const { data: statuses = [] } = useStatuses();
  const status = useLocalWrite((db, statusId: string) => setTaskStatus(db, id, statusId));
  const dates = useLocalWrite((db, due: string | null) =>
    setTaskDates(db, id, task?.startDate ?? null, due),
  );
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
          <TaskDetail id={id} readOnly={readOnly} />
        ) : null}
        {entity.type === "note" || entity.type === "jot" ? (
          <PageEditor entityId={id} readOnly={readOnly} />
        ) : null}
        {entity.type === "bookmark" ? <BookmarkDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "calendar_entry" ? (
          <CalendarEntryDetail id={id} readOnly={readOnly} />
        ) : null}
        {entity.type === "course" ? <CourseDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "exam" ? <ExamDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "assignment" ? <AssignmentDetail id={id} readOnly={readOnly} /> : null}
        {entity.type === "index_card_deck" ? <DeckDetail id={id} readOnly={readOnly} /> : null}
        {/* Labels and links belong to a Space of your own, not to one shared with you. */}
        {entity.deletedAt || isSharedSpace(entity.spaceId) ? null : (
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
