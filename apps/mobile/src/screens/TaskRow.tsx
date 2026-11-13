import type { TaskRecord, TaskStatus } from "@nookly/shared/data";
import { useEntityMenu } from "./entity-actions.tsx";
import { setTaskStatus, trashEntity } from "@nookly/shared/data";
import Svg, { Circle, Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { useLocalWrite } from "../data/context.tsx";
import { Badge, SpaceDot } from "../ui/Badge.tsx";
import { ListItem } from "../ui/ListMotion.tsx";
import { ROW_DIVIDER } from "../ui/Row.tsx";
import { Text } from "../ui/Text.tsx";
import { cn } from "../ui/classes.ts";
import { Pressable, View } from "react-native";
import { effortLabel } from "@nookly/shared/effort";
import { useSetting } from "../data/settings.ts";
import { dueText } from "./dashboard-model.ts";
import { SwipeRow } from "../ui/SwipeRow.tsx";
import { useTheme } from "../ui/theme.ts";
import { haptic } from "../ui/haptics.ts";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { useOptionalSheetHost } from "../ui/sheet/SheetHost.tsx";
import { CHECK_PRESS_SCALE } from "../ui/motion.ts";
import Animated from "react-native-reanimated";
import { usePressScale } from "../ui/press.ts";
import { CONTROL_SIZE, touchSlop } from "../ui/touch.ts";
import { dayLabel, localDay } from "./dates.ts";

/// How a status is drawn: the desktop's five kinds of circle.
type StatusKind = "backlog" | "unstarted" | "started" | "completed" | "canceled";

function kindOf(status: TaskStatus | undefined): StatusKind {
  if (!status || status.id === "backlog") return "backlog";
  if (status.id === "cancelled") return "canceled";
  if (status.doneness >= 100) return "completed";
  if (status.doneness > 0) return "started";
  return "unstarted";
}

/// The pie's circumference: a circle of radius 2, drawn 4 wide, fills to radius 4.
const PIE = 2 * Math.PI * 2;

/// A task's status as its circle, drawn exactly as the desktop's (`TaskStatusIcon`): a
/// dashed ring for the backlog, a ring, a ring filling as a pie while started, and a filled
/// disc with a check or a cross when done or cancelled.
export function StatusIcon({
  status,
  size = 20,
}: {
  status: TaskStatus | undefined;
  size?: number;
}) {
  const theme = useTheme();
  const color = status?.color ?? theme.colors.mutedForeground;
  const kind = kindOf(status);
  const done = kind === "completed" || kind === "canceled";
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      accessibilityLabel={status?.name ?? "Status"}
    >
      {done ? (
        <>
          <Circle cx={7} cy={7} r={7} fill={color} />
          <Path
            d={
              kind === "completed" ? "M4.2 7.2 6.1 9.1 9.8 5.2" : "M4.9 4.9 9.1 9.1M9.1 4.9 4.9 9.1"
            }
            stroke={theme.colors.background}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <Circle
            cx={7}
            cy={7}
            r={6}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray={kind === "backlog" ? "1.4 1.74" : undefined}
          />
          {kind === "started" && status ? (
            <Circle
              cx={7}
              cy={7}
              r={2}
              stroke={color}
              strokeWidth={4}
              strokeDasharray={`${(status.doneness / 100) * PIE} ${PIE}`}
              transform="rotate(-90 7 7)"
            />
          ) : null}
        </>
      )}
    </Svg>
  );
}

/// A task's circle in a list, as the desktop's row: a tap opens its statuses to pick from,
/// the circle giving way under the finger.
function StatusButton({
  title,
  status,
  statuses,
  onPick,
}: {
  title: string;
  status: TaskStatus | undefined;
  statuses: TaskStatus[];
  onPick: (statusId: string) => void;
}) {
  const host = useOptionalSheetHost();
  const press = usePressScale(CHECK_PRESS_SCALE);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Status of ${title}`}
      accessibilityValue={{ text: status?.name ?? "" }}
      hitSlop={touchSlop(CONTROL_SIZE.check)}
      unstable_pressDelay={0}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() =>
        host?.present({
          title: "Status",
          content: (
            <OptionList
              label="Status"
              search={false}
              value={status?.id ?? null}
              options={statuses.map((s) => ({
                id: s.id,
                label: s.name,
                icon: <StatusIcon status={s} size={17} />,
                tint: s.color,
              }))}
              onChange={(id) => {
                if (statuses.find((s) => s.id === id)?.doneness === 100) haptic("complete");
                onPick(id);
              }}
            />
          ),
        })
      }
    >
      {/* The button says what it does; the status's own name would read twice. */}
      <Animated.View
        style={press.style}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <StatusIcon status={status} />
      </Animated.View>
    </Pressable>
  );
}

/// When a task is due, said once: how late it is or "Today" and "Tomorrow" while it is
/// close, the day itself once it is further out.
export function DueLine({
  day,
  due,
}: {
  day: string;
  due: { text: string; overdue: boolean } | null;
}) {
  const near = due && (due.overdue || due.text === "Today" || due.text === "Tomorrow");
  return (
    <Text
      variant="small"
      tone={due?.overdue ? "destructive" : due?.text === "Today" ? "caution" : "muted"}
    >
      {near ? due.text : dayLabel(day)}
    </Text>
  );
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
    <ListItem>
      <SwipeRow
        left={{
          label: finished ? "Reopen" : "Done",
          tone: "positive",
          haptic: finished ? "tap" : "complete",
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
            "min-h-14 justify-center gap-1 px-1 py-2 active:bg-accent/40",
            ROW_DIVIDER,
            finished && "opacity-50",
          )}
        >
          <View className="flex-row items-center gap-3">
            <StatusButton
              title={task.entity.title || "Untitled"}
              status={status}
              statuses={statuses}
              onPick={(id) => setStatus.mutate(id)}
            />
            <Text numberOfLines={1} className="flex-1">
              {task.entity.title || "Untitled"}
            </Text>
          </View>
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1 pl-8">
            <Text variant="small" tone="muted">
              {task.entity.key}
            </Text>
            {task.dueDate ? <DueLine day={task.dueDate} due={due} /> : null}
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
    </ListItem>
  );
}
