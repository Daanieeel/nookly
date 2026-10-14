import type { TaskRecord, TaskStatus } from "@nookly/shared/data";
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
import { Row } from "../ui/Row.tsx";
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
  const color = status?.color ?? "#94a3b8";
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
export function TaskRow({
  task,
  statuses,
  spaceColor,
}: {
  task: TaskRecord;
  statuses: TaskStatus[];
  spaceColor?: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const status = statuses.find((s) => s.id === task.statusId);
  const finished = (status?.doneness ?? 0) >= 100;
  const setStatus = useLocalWrite((db, statusId: string) =>
    setTaskStatus(db, task.entity.id, statusId),
  );
  const trash = useLocalWrite((db, id: string) => trashEntity(db, id));
  const overdue = !finished && task.dueDate !== null && task.dueDate < localDay();
  return (
    <SwipeRow
      left={{
        label: finished ? "Reopen" : "Done",
        color: theme.colors.positive,
        onPress: () => setStatus.mutate(finished ? "todo" : "done"),
      }}
      right={{
        label: "Trash",
        color: theme.colors.destructive,
        onPress: () => trash.mutate(task.entity.id),
      }}
    >
      <Row
        title={task.entity.title || "Untitled"}
        subtitle={task.entity.key}
        muted={finished}
        icon={<StatusIcon status={status} />}
        onPress={() => router.push(`/entity/${task.entity.id}`)}
        trailing={
          <>
            {spaceColor ? <SpaceDot color={spaceColor} /> : null}
            {task.dueDate ? (
              <Badge
                label={dayLabel(task.dueDate)}
                color={overdue ? theme.colors.destructive : undefined}
              />
            ) : null}
          </>
        }
      />
    </SwipeRow>
  );
}
