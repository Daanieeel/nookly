import { renameEntity, setCurrentSemester, trashEntity, updateSemester } from "@nookly/shared/data";
import { useEntityMenu } from "./entity-actions.tsx";
import { CARD_CLASSES } from "@nookly/ui/classes";
import {
  IconCalendarEvent,
  IconCalendarStats,
  IconDots,
  IconFlag,
  IconPencil,
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
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { dayLabel } from "./dates.ts";
import { CORNER, RADIUS, SPACE } from "../ui/tokens.ts";

/// When a semester runs, as its list and the course page's picker say it.
export const semesterRange = (s: SemesterRecord) =>
  s.startDate && s.endDate ? `${dayLabel(s.startDate)} to ${dayLabel(s.endDate)}` : null;

const shortDay = (day: string, year: boolean) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: year ? "numeric" : undefined,
  });

/// When a semester runs, short for its row: "Oct 15 to Feb 15, 2027", the year only where it
/// is not this one.
export function semesterSpan(
  s: Pick<SemesterRecord, "startDate" | "endDate">,
  thisYear = new Date().getFullYear(),
) {
  if (!s.startDate || !s.endDate) return null;
  const other = (day: string) => Number(day.slice(0, 4)) !== thisYear;
  const ends = other(s.endDate);
  return `${shortDay(s.startDate, other(s.startDate) && !ends)} to ${shortDay(s.endDate, ends)}`;
}

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
  const name = semester.entity.title || "Untitled";
  const open = () => router.push(`/entity/${semester.entity.id}`);
  return (
    // Room under a current semester for its badge, which hangs over the card's edge.
    <View style={{ marginBottom: semester.isCurrent ? SPACE.sm : 0 }}>
      <View className={cn(CARD_CLASSES, "gap-0 py-0", semester.isCurrent && "border-primary")}>
        <View className="min-h-16 flex-row items-center gap-1 py-1 pl-4 pr-1.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={name}
            onPress={open}
            onLongPress={() => entityMenu(semester.entity)}
            className="flex-1 flex-row items-center gap-3 py-2.5 active:opacity-60"
          >
            <IconBadge glyph={IconCalendarStats} tint="blue" />
            <View className="flex-1 gap-1">
              <View className="flex-row items-center gap-2">
                <Text variant="small" tone="muted">
                  {semester.entity.key}
                </Text>
                <Text numberOfLines={1} className="shrink font-semibold">
                  {name}
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-x-2">
                <Text variant="small" tone="muted">
                  {`${mine.length} ${mine.length === 1 ? "course" : "courses"}`}
                </Text>
                {semesterSpan(semester) ? (
                  <Text variant="small" tone="muted">
                    {semesterSpan(semester)}
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>
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
                  label: "Set Dates",
                  icon: IconCalendarEvent,
                  onPress: () => setDating(true),
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
      </View>
      {semester.isCurrent ? (
        // Centred on the card's bottom edge, over its border.
        <View
          testID="current-badge"
          pointerEvents="none"
          style={[
            CORNER,
            {
              position: "absolute",
              alignSelf: "center",
              bottom: -BADGE_OVERHANG,
              // The badge's tint is see through: on the page's colour the border stops at it.
              backgroundColor: theme.colors.background,
              borderRadius: RADIUS.badge,
            },
          ]}
        >
          <Badge label="Current" variant="primary" size="sm" />
        </View>
      ) : null}
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
    </View>
  );
}

/// Half the small badge's height: how far it hangs below the card it sits on.
const BADGE_OVERHANG = 10;

/// A Space's Semesters, one card each: its key, name, how many courses and its dates, a
/// Current badge on the current one's bottom edge, and a menu to flag it as current, set its
/// dates, rename it or trash it. A tap opens it.
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
    <View className="gap-3">
      {semesters.map((s) => (
        <SemesterRow key={s.entity.id} semester={s} />
      ))}
    </View>
  );
}
