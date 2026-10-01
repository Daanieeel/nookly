import { type KeyboardEvent, useRef } from "react";
import { clockCycle, useDateTimeSettings } from "#/lib/datetime.ts";
import { cn } from "@nookly/ui/lib/utils";

type Segment = "hour" | "minute" | "period";

const pad = (n: number) => String(n).padStart(2, "0");

function parse(value: string) {
  const [h, m] = value.split(":").map(Number);
  return { hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 };
}

/// A time field made of typeable segments (hour, minute and, on a 12 hour clock,
/// AM or PM) in the chosen time format, unlike a native time input, which follows
/// the webview's locale. Type digits, or use the arrow keys to step a segment.
/// Values are `HH:mm`.
export function TimeInput({
  value,
  onChange,
  onBlur,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (time: string) => void;
  onBlur?: () => void;
  className?: string;
  "aria-label"?: string;
}) {
  // Re-render when the time format changes.
  useDateTimeSettings((s) => `${s.timezone}|${s.timeFormat}`);
  const { twelveHour, am, pm } = clockCycle();
  const { hour, minute } = parse(value);
  const refs = useRef<Partial<Record<Segment, HTMLSpanElement | null>>>({});
  // Digits typed into the focused segment so far.
  const typed = useRef("");

  const segments: Segment[] = twelveHour ? ["hour", "minute", "period"] : ["hour", "minute"];

  function commit(h: number, m: number) {
    const next = `${pad(h)}:${pad(m)}`;
    if (next !== value) onChange(next);
  }

  function step(segment: Segment, delta: number) {
    typed.current = "";
    if (segment === "hour") commit((hour + delta + 24) % 24, minute);
    else if (segment === "minute") commit(hour, (minute + delta + 60) % 60);
    else commit((hour + 12) % 24, minute);
  }

  function focusSegment(segment: Segment | undefined) {
    if (segment) refs.current[segment]?.focus();
  }

  function type(segment: Segment, digit: number) {
    const buffer = typed.current + digit;
    if (segment === "hour") {
      const max = twelveHour ? 12 : 23;
      const first = Number(buffer[0]);
      const done = buffer.length === 2 || first * 10 > max;
      const entered = Number(buffer);
      if (entered > max) {
        typed.current = String(digit);
        return type(segment, digit);
      }
      if (twelveHour) {
        const pm12 = hour >= 12;
        commit((entered % 12) + (pm12 ? 12 : 0), minute);
      } else {
        commit(entered, minute);
      }
      typed.current = done ? "" : buffer;
      if (done) focusSegment("minute");
    } else if (segment === "minute") {
      const entered = Number(buffer);
      if (entered > 59) {
        typed.current = String(digit);
        return type(segment, digit);
      }
      commit(hour, entered);
      const done = buffer.length === 2 || Number(buffer[0]) > 5;
      typed.current = done ? "" : buffer;
      if (done) focusSegment(twelveHour ? "period" : undefined);
    }
  }

  function onKeyDown(e: KeyboardEvent, segment: Segment) {
    const index = segments.indexOf(segment);
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      if (segment !== "period") type(segment, Number(e.key));
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      step(segment, e.key === "ArrowUp" ? 1 : -1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusSegment(segments[index - 1]);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusSegment(segments[index + 1]);
    } else if (segment === "period" && /^[ap]$/i.test(e.key)) {
      e.preventDefault();
      const wantPm = e.key.toLowerCase() === "p";
      if (wantPm !== hour >= 12) step("period", 1);
    } else if (e.key !== "Tab") {
      e.preventDefault();
    }
  }

  const text = {
    hour: pad(twelveHour ? hour % 12 || 12 : hour),
    minute: pad(minute),
    period: hour >= 12 ? pm : am,
  };
  const names = { hour: "Hour", minute: "Minute", period: "AM or PM" };

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- sees focus leave the segments
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a fieldset would add default borders
      role="group"
      aria-label={ariaLabel}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        typed.current = "";
        onBlur?.();
      }}
      className={cn(
        "flex h-8 min-w-0 items-center gap-0.5 rounded-md border border-input bg-accent px-2 text-sm shadow-xs transition-colors focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      {segments.map((segment) => (
        <span key={segment} className="flex items-center gap-0.5">
          {segment === "minute" && <span className="text-muted-foreground">:</span>}
          {segment === "period" && <span className="w-1" />}
          <span
            ref={(el) => {
              refs.current[segment] = el;
            }}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a typeable segment of a time field, no native tag fits
            role="spinbutton"
            tabIndex={0}
            aria-label={`${ariaLabel ?? "Time"} ${names[segment]}`}
            aria-valuetext={text[segment]}
            aria-valuenow={segment === "period" ? undefined : Number(text[segment])}
            onFocus={() => {
              typed.current = "";
            }}
            onKeyDown={(e) => onKeyDown(e, segment)}
            className="cursor-default rounded-sm px-0.5 tabular-nums outline-none focus:bg-primary focus:text-primary-foreground"
          >
            {text[segment]}
          </span>
        </span>
      ))}
    </div>
  );
}
