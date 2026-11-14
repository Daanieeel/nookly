import { renameEntity, setCurrentSemester, trashEntity, updateSemester } from "@nookly/shared/data";
import { useEntityMenu } from "./entity-actions.tsx";
import { CARD_CLASSES } from "@nookly/ui/classes";
import {
  IconArrowUpRight,
  IconCalendarStats,
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconFlag,
  IconPencil,
  IconSchool,
  IconTrash,
} from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import type { SemesterRecord } from "@nookly/shared/data";
import { useCourseSemesters, useCourses, useSemesters } from "../data/queries.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button, IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Field } from "../ui/Field.tsx";
import { useMenu } from "../ui/menu.tsx";
import { Sheet, useSheet } from "../ui/sheet/Sheet.tsx";
import { DateField } from "../ui/DateField.tsx";
import { FormSection } from "../ui/kit/Form.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { dayLabel } from "./dates.ts";

/// When a semester runs, as its list and the course page's picker say it.
export const semesterRange = (s: SemesterRecord) =>
  s.startDate && s.endDate ? `${dayLabel(s.startDate)} to ${dayLabel(s.endDate)}` : null;

/// A new name typed in the menu's sheet, as the desktop renames a semester in place.
function RenameForm({ current, onSave }: { current: string; onSave: (name: string) => void }) {
  const sheet = useSheet();
  const [name, setName] = useState(current);
  const save = () => {
    if (name.trim() && name.trim() !== current) onSave(name.trim());
    sheet?.close();
  };
  return (
    <View className="gap-3">
      <Field
        label="Name"
        autoFocus
        selectTextOnFocus
        value={name}
        onChangeText={setName}
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <Button label="Rename" onPress={save} />
    </View>
  );
}

function SemesterRow({ semester }: { semester: SemesterRecord }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const theme = useTheme();
  const present = useMenu();
  const muted = theme.colors.mutedForeground;
  const [open, setOpen] = useState(false);
  const { data: courses = [] } = useCourses(semester.entity.spaceId);
  const { data: inSemester = new Map<string, string>() } = useCourseSemesters(
    semester.entity.spaceId,
  );
  const mine = courses.filter((c) => inSemester.get(c.entity.id) === semester.entity.id);
  const rename = useLocalWrite((db, name: string) => renameEntity(db, semester.entity.id, name));
  const current = useLocalWrite((db) =>
    setCurrentSemester(db, semester.entity.spaceId, semester.entity.id),
  );
  const trash = useLocalWrite((db) => trashEntity(db, semester.entity.id));
  const dates = useLocalWrite((db, patch: { startDate?: string; endDate?: string }) =>
    updateSemester(db, semester.entity.id, patch),
  );
  const [dating, setDating] = useState(false);
  const Chevron = open ? IconChevronDown : IconChevronRight;
  const name = semester.entity.title || "Untitled";
  return (
    <View
      className={cn(
        CARD_CLASSES,
        "gap-0 overflow-hidden py-0",
        semester.isCurrent && "border-primary",
      )}
    >
      <View className="min-h-14 flex-row items-center gap-2 pl-3 pr-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((o) => !o)}
          className="flex-1 flex-row items-center gap-2 py-2 active:opacity-60"
        >
          <Chevron size={16} color={muted} />
          <IconCalendarStats size={16} color={muted} />
          <View className="flex-1 gap-0.5">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text variant="small" tone="muted">
                {semester.entity.key}
              </Text>
              <Text numberOfLines={1} className="font-semibold">
                {name}
              </Text>
              {semester.isCurrent ? <Badge label="Current" variant="positive" size="sm" /> : null}
            </View>
            <Text variant="small" tone="muted">
              {`${mine.length} ${mine.length === 1 ? "course" : "courses"} · ${semesterRange(semester) ?? ""}`}
            </Text>
          </View>
        </Pressable>
        {semesterRange(semester) ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Set dates of ${name}`}
            onPress={() => setDating(true)}
            hitSlop={8}
            className="min-h-11 justify-center px-2 active:opacity-60"
          >
            <Text variant="small" tone="primary" className="font-medium">
              Set dates
            </Text>
          </Pressable>
        )}
        <IconButton
          label={`Open ${name}`}
          icon={<IconArrowUpRight size={20} color={muted} />}
          onPress={() => router.push(`/entity/${semester.entity.id}`)}
        />
        <IconButton
          label={`Options for ${name}`}
          icon={<IconDots size={20} color={muted} />}
          onPress={() =>
            present.show(name, [
              semester.isCurrent
                ? { label: "Current Semester", icon: IconFlag, disabled: true }
                : {
                    label: "Flag as Current",
                    icon: IconFlag,
                    onPress: () => current.mutate(undefined),
                  },
              {
                label: "Open",
                icon: IconArrowUpRight,
                onPress: () => router.push(`/entity/${semester.entity.id}`),
              },
              {
                label: "Rename",
                icon: IconPencil,
                page: () => <RenameForm current={name} onSave={(next) => rename.mutate(next)} />,
              },
              {
                label: "Move to Trash",
                icon: IconTrash,
                destructive: true,
                onPress: () => trash.mutate(undefined),
              },
            ])
          }
        />
      </View>
      <Sheet open={dating} onOpenChange={setDating} title="Dates" presentation="card">
        <FormSection>
          <DateField
            label="Starts"
            clearable={false}
            value={semester.startDate}
            onChange={(startDate) => startDate && dates.mutate({ startDate })}
          />
          <DateField
            label="Ends"
            clearable={false}
            value={semester.endDate}
            onChange={(endDate) => endDate && dates.mutate({ endDate })}
          />
        </FormSection>
      </Sheet>
      {open ? (
        <View className="border-t border-border/60">
          {mine.length === 0 ? (
            <Text tone="muted" className="p-4">
              No courses in this semester.
            </Text>
          ) : null}
          {mine.map((c) => (
            <Pressable
              key={c.entity.id}
              accessibilityRole="button"
              accessibilityLabel={`${c.entity.title || "Untitled"}, ${c.entity.key}`}
              onPress={() => router.push(`/entity/${c.entity.id}`)}
              onLongPress={() => entityMenu(c.entity)}
              className="min-h-11 flex-row items-center gap-3 px-4 active:bg-accent/40"
            >
              <IconSchool size={16} color={muted} />
              <Text numberOfLines={1} className="flex-1">
                {c.entity.title || "Untitled"}
              </Text>
              <Text variant="small" tone="muted">
                {c.entity.key}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/// A Space's Semesters, one expandable row each as on the desktop: its key, name, a Current
/// badge, how many courses and its dates, with a menu to open it, rename it, flag it as the
/// current one or trash it; open, it lists its courses.
export function SemesterList({ spaceId }: { spaceId: string }) {
  const { data: semesters = [] } = useSemesters(spaceId);
  if (semesters.length === 0) {
    return (
      <View className="p-8">
        <Text tone="muted" className="text-center">
          No semesters yet. Tap + to add one, or the wand to set up a run of them.
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-2">
      {semesters.map((s) => (
        <SemesterRow key={s.entity.id} semester={s} />
      ))}
    </View>
  );
}
