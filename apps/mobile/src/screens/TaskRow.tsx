import type { TaskRecord, TaskStatus } from "@nookly/shared/data";
import { useEntityMenu } from "./entity-actions.tsx";
import { setTaskStatus, trashEntity } from "@nookly/shared/data";
import {
  IconCircle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleHalf2,
  IconCircleX,
} from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useLocalWrite } from "../data/context.tsx";
import { Badge, SpaceDot } from "../ui/Badge.tsx";
import { ROW_DIVIDER } from "../ui/Row.tsx";
import { Text } from "../ui/Text.tsx";
import { cn } from "../ui/classes.ts";
import { Pressable, View } from "react-native";
import { effortLabel } from "@nookly/shared/effort";
import { useSetting } from "../data/settings.ts";
import { dueText } from "./dashboard-model.ts";
import { SwipeRow } from "../ui/SwipeRow.tsx";
import { useTheme } from "../ui/theme.ts";
import { dayLabel, localDay } from "./dates.ts";

/// A task's status as its circle, the way the desktop draws it.
export function StatusIcon({
  status,
  size = 20,
}: {
  status: TaskStatus | undefined;
  size?: number;
}) {
  const theme = useTheme();
  const color = status?.color ?? theme.colors.mutedForeground;
  const label = status?.name ?? "Status";
  if (!status || status.id === "backlog")
    return <IconCircleDashed size={size} color={color} accessibilityLabel={label} />;
  if (status.id === "cancelled")
    return <IconCircleX size={size} color={color} accessibilityLabel={label} />;
  if (status.doneness >= 100)
    return <IconCircleCheck size={size} color={color} accessibilityLabel={label} />;
  if (status.doneness > 0)
    return <IconCircleHalf2 size={size} color={color} accessibilityLabel={label} />;
  return <IconCircle size={size} color={color} accessibilityLabel={label} />;
}

/// A task in a list. Swipe right to finish it (or open it again), left to move it to Trash.
/// Two lines, like the desktop's row: the status and title, then the key, when it is due and
/// how long that is, its labels, its Space and its effort.
export function TaskRow({
  task,
  statuses,
  spaceColor,
  spaceName,
  labels = [],
}: {
  task: TaskRecord;
  statuses: TaskStatus[];
  spaceColor?: string;
  /// Shown with the Space's color where tasks of several Spaces are listed together.
  spaceName?: string;
  labels?: { id: string; name: string; color: string }[];
}) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const [scale] = useSetting("general.effortScale");
  const status = statuses.find((s) => s.id === task.statusId);
  const finished = (status?.doneness ?? 0) >= 100;
  const setStatus = useLocalWrite((db, statusId: string) =>
    setTaskStatus(db, task.entity.id, statusId),
  );
  const trash = useLocalWrite((db, id: string) => trashEntity(db, id));
  const today = localDay();
  const due = task.dueDate && !finished ? dueText(task.dueDate.slice(0, 10), today) : null;
  return (
    <SwipeRow
      left={{
        label: finished ? "Reopen" : "Done",
        tone: "positive",
        onPress: () => setStatus.mutate(finished ? "todo" : "done"),
      }}
      right={{
        label: "Trash",
        tone: "destructive",
        onPress: () => trash.mutate(task.entity.id),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${task.entity.title || "Untitled"}, ${task.entity.key}`}
        onPress={() => router.push(`/entity/${task.entity.id}`)}
        onLongPress={() => entityMenu(task.entity)}
        className={cn(
          "min-h-14 justify-center gap-1 px-4 py-2 active:bg-accent/40",
          ROW_DIVIDER,
          finished && "opacity-50",
        )}
      >
        <View className="flex-row items-center gap-3">
          <StatusIcon status={status} />
          <Text numberOfLines={1} className="flex-1">
            {task.entity.title || "Untitled"}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1 pl-8">
          <Text variant="small" tone="muted">
            {task.entity.key}
          </Text>
          {task.dueDate ? (
            <Text variant="small" tone="muted">
              {dayLabel(task.dueDate)}
            </Text>
          ) : null}
          {due ? (
            <Text
              variant="small"
              tone={due.overdue ? "destructive" : due.text === "Today" ? "caution" : "muted"}
            >
              {due.text}
            </Text>
          ) : null}
          {labels.map((label) => (
            <Badge key={label.id} label={label.name} size="sm" />
          ))}
          {spaceName ? (
            <View className="flex-row items-center gap-1">
              {spaceColor ? <SpaceDot color={spaceColor} /> : null}
              <Text variant="small" tone="muted">
                {spaceName}
              </Text>
            </View>
          ) : spaceColor ? (
            <SpaceDot color={spaceColor} />
          ) : null}
          {task.effort !== null ? (
            <Badge label={effortLabel(task.effort, scale)} size="sm" />
          ) : null}
        </View>
      </Pressable>
    </SwipeRow>
  );
}
