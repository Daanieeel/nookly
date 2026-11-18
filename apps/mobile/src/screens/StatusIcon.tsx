import type { TaskStatus } from "@nookly/shared/data";
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "../ui/theme.ts";

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
