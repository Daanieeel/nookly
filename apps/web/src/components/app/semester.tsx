import type { CSSProperties } from "react";
import {
  IconCalendarStats,
  IconCalendarWeek,
  IconChalkboard,
  IconReportAnalytics,
} from "@tabler/icons-react";
import { cn } from "@nookly/ui/lib/utils";
import { samples } from "@/content/samples";
import type { Locale } from "@/lib/i18n";

const TONES = new Map([
  ["blue", "var(--accent-blue)"],
  ["green", "var(--accent-green)"],
  ["purple", "var(--accent-purple)"],
]);

/// A week of sessions, the next exam's countdown with its flash cards, and the grade
/// average, each the way its module shows it.
export function SemesterMock({ locale, className }: { locale: Locale; className?: string }) {
  const s = samples(locale).semester;
  return (
    <div aria-hidden className={cn("flex flex-col gap-3 p-4 select-none", className)}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconCalendarWeek size={16} className="text-muted-foreground" />
        {s.name}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{s.week}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {s.sessions.map((session) => (
          <div
            key={session.course}
            className="flex items-center gap-3 rounded-md border border-(--tone)/30 bg-(--tone)/8 px-3 py-2"
            // SAFETY: `--tone` only ever receives one of the accent colour variables above.
            style={{ "--tone": TONES.get(session.tone) } as CSSProperties}
          >
            <span className="flex w-10 shrink-0 flex-col text-xs/tight ">
              <span className="font-medium">{session.day}</span>
              <span className="text-muted-foreground tabular-nums">{session.time}</span>
            </span>
            <span className="h-7 w-0.5 rounded-full bg-(--tone)" />
            <span className="flex min-w-0 flex-1 flex-col text-sm/tight ">
              <span className="truncate font-medium">{session.course}</span>
              <span className="truncate text-xs text-muted-foreground">
                <IconChalkboard size={11} className="mr-1 inline" />
                {session.kind} · {session.room}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconCalendarStats size={13} />
            {s.exam.course}
          </span>
          <span className="font-display text-lg leading-none font-semibold">{s.exam.in}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <span
              className="block h-full rounded-full bg-positive"
              style={{ width: `${s.exam.progress}%` }}
            />
          </span>
          <span className="text-xs text-muted-foreground">
            {s.exam.progress}% {s.exam.cards}
          </span>
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconReportAnalytics size={13} />
            {s.grades.label}
          </span>
          <span className="font-display text-3xl leading-none font-semibold">{s.grades.value}</span>
          <span className="mt-auto text-xs text-muted-foreground">{s.grades.ects}</span>
        </div>
      </div>
    </div>
  );
}
