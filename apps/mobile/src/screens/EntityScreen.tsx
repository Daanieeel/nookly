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
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { z } from "zod";
import { useAppData, useLocalWrite } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { useEntity, useSpaces, useStatuses, useTask } from "../data/queries.ts";
import { Badge, SpaceDot } from "../ui/Badge.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { FONT, useTheme } from "../ui/theme.ts";
import { BookmarkDetail } from "./BookmarkDetail.tsx";
import { CalendarEntryDetail } from "./CalendarEntryDetail.tsx";
import { addDays, localDay } from "./dates.ts";
import { PageEditor } from "./PageEditor.tsx";
import { StatusIcon } from "./TaskRow.tsx";

/// A page someone shared to view only can't be changed here either.
export function useReadOnly(entity: EntityRecord | null | undefined): boolean {
  const { sync } = useAppData();
  const shared = entity?.spaceId.startsWith("shared-") ?? false;
  const { data: role } = useQuery({
    queryKey: keys.role(entity?.id ?? ""),
    queryFn: () => sync.engine.roleOf(entity?.id ?? ""),
    enabled: shared,
  });
  return role === "viewer" || Boolean(entity?.deletedAt);
}

function TitleField({ entity, readOnly }: { entity: EntityRecord; readOnly: boolean }) {
  const theme = useTheme();
  const [title, setTitle] = useState(entity.title);
  useEffect(() => setTitle(entity.title), [entity.title]);
  const rename = useLocalWrite((db, next: string) => renameEntity(db, entity.id, next));
  return (
    <TextInput
      accessibilityLabel="Title"
      value={title}
      editable={!readOnly}
      placeholder="Untitled"
      placeholderTextColor={theme.colors.mutedForeground}
      onChangeText={setTitle}
      onEndEditing={() => title !== entity.title && rename.mutate(title.trim())}
      multiline
      style={{
        fontFamily: FONT.heading,
        fontSize: theme.text.xl,
        color: theme.colors.foreground,
        padding: 0,
      }}
    />
  );
}

function Actions({ entity }: { entity: EntityRecord }) {
  const theme = useTheme();
  const pin = useLocalWrite((db, next: boolean) => setPinned(db, entity.id, next));
  const trash = useLocalWrite((db) => trashEntity(db, entity.id));
  const restore = useLocalWrite((db) => restoreEntity(db, entity.id));
  return (
    <View style={{ flexDirection: "row", gap: theme.space(2), flexWrap: "wrap" }}>
      {entity.deletedAt ? (
        <Button
          label="Restore"
          status={statusOf(restore)}
          errorLabel="Couldn't restore"
          onPress={() => restore.mutate(undefined)}
        />
      ) : (
        <>
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

const dayField = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the form 2026-10-31"),
]);

const REPEATS: { label: string; rule: RepeatRule | null }[] = [
  { label: "Never", rule: null },
  { label: "Daily", rule: { every: 1, unit: "day" } },
  { label: "Weekly", rule: { every: 1, unit: "week" } },
  { label: "Monthly", rule: { every: 1, unit: "month" } },
];

function Choice({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(1.5),
        minHeight: 36,
        paddingHorizontal: theme.space(3),
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.input,
        backgroundColor: selected ? `${theme.colors.primary}1a` : theme.colors.secondary,
      }}
    >
      {icon}
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

function TaskDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const { data: task } = useTask(id);
  const { data: statuses = [] } = useStatuses();
  const status = useLocalWrite((db, statusId: string) => setTaskStatus(db, id, statusId));
  const dates = useLocalWrite((db, due: string | null) =>
    setTaskDates(db, id, task?.startDate ?? null, due),
  );
  const repeat = useLocalWrite((db, rule: RepeatRule | null) => setTaskRepeat(db, id, rule));
  const [due, setDue] = useState(task?.dueDate ?? "");
  useEffect(() => setDue(task?.dueDate ?? ""), [task?.dueDate]);
  if (!task) return null;
  const dueError = dayField.safeParse(due).success ? undefined : "Use the form 2026-10-31";
  const saveDue = (value: string) => {
    setDue(value);
    if (dayField.safeParse(value).success && value !== (task.dueDate ?? ""))
      dates.mutate(value || null);
  };
  return (
    <>
      <Section title="Status">
        <View
          accessibilityRole="radiogroup"
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.space(2),
            padding: theme.space(3),
          }}
        >
          {statuses.map((s) => (
            <Choice
              key={s.id}
              label={s.name}
              selected={s.id === task.statusId}
              icon={<StatusIcon status={s} size={16} />}
              onPress={() => !readOnly && status.mutate(s.id)}
            />
          ))}
        </View>
      </Section>
      <Section title="Due">
        <View style={{ padding: theme.space(3), gap: theme.space(2) }}>
          <Field
            label="Due date"
            placeholder="2026-10-31"
            value={due}
            editable={!readOnly}
            onChangeText={setDue}
            onEndEditing={() => saveDue(due)}
            error={dueError}
            keyboardType="numbers-and-punctuation"
          />
          {!readOnly ? (
            <View style={{ flexDirection: "row", gap: theme.space(2) }}>
              <Button label="Today" onPress={() => saveDue(localDay())} />
              <Button label="Tomorrow" onPress={() => saveDue(addDays(localDay(), 1))} />
              <Button label="Clear" variant="ghost" onPress={() => saveDue("")} />
            </View>
          ) : null}
        </View>
      </Section>
      <Section title="Repeat">
        <View
          accessibilityRole="radiogroup"
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.space(2),
            padding: theme.space(3),
          }}
        >
          {REPEATS.map((r) => (
            <Choice
              key={r.label}
              label={r.label}
              selected={JSON.stringify(r.rule) === JSON.stringify(task.repeat)}
              onPress={() => !readOnly && repeat.mutate(r.rule)}
            />
          ))}
        </View>
      </Section>
    </>
  );
}

/// One entity, as its own type shows it. Every type gets its title, Space, key, Pin
/// and Trash; Tasks, pages, bookmarks and calendar entries also their own fields.
export function EntityScreen({ id }: { id: string }) {
  const theme = useTheme();
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
    <>
      <Stack.Screen options={{ title: entity.key }} />
      <Screen>
        <View style={{ gap: theme.space(2) }}>
          <TitleField entity={entity} readOnly={readOnly} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
            {space ? <SpaceDot color={space.color} /> : null}
            <Text variant="small" tone="muted">
              {space?.name ?? ""}
            </Text>
            {entity.deletedAt ? <Badge label="In Trash" color={theme.colors.destructive} /> : null}
            {readOnly && !entity.deletedAt ? <Badge label="View only" /> : null}
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
        {!readOnly || entity.deletedAt ? <Actions entity={entity} /> : null}
      </Screen>
    </>
  );
}
