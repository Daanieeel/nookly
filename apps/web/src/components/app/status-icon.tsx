import type { CSSProperties } from "react";

/// The desktop's status glyphs (`TaskStatusIcon`), in the default statuses' colours:
/// an empty ring for to do, a half filled ring while in progress, a check once done.
const COLORS = { todo: "#64748b", in_progress: "#3b82f6", done: "#22c55e" } as const;

export type StatusKind = keyof typeof COLORS;

export function StatusIcon({ status, size = 14 }: { status: StatusKind; size?: number }) {
  const fill = 2 * Math.PI * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className="shrink-0 text-(--status-color)"
      style={{ "--status-color": COLORS[status] } as CSSProperties}
    >
      {status === "done" ? (
        <>
          <circle cx="7" cy="7" r="7" fill="currentColor" />
          <path
            d="M4.2 7.2 6.1 9.1 9.8 5.2"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-card"
          />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
          {status === "in_progress" && (
            <circle
              cx="7"
              cy="7"
              r="2"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={`${fill / 2} ${fill}`}
              transform="rotate(-90 7 7)"
            />
          )}
        </>
      )}
    </svg>
  );
}
