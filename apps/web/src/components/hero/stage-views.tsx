import type { ComponentType, CSSProperties, ReactNode } from "react";
import { Blobatar } from "@blobatar/react";
import { happy } from "blobatar/expression";
import {
  IconCalendarEvent,
  IconCalendarStats,
  IconCards,
  IconChalkboard,
  IconChecklist,
  IconChevronRight,
  IconClipboardCheck,
  IconClipboardList,
  IconFeather,
  IconTargetArrow,
} from "@tabler/icons-react";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { MoodleMock } from "../app/moodle";
import { NotePageMock } from "../app/note-page";
import { SemesterMock } from "../app/semester";
import { StatusIcon } from "../app/status-icon";
import { TaskListMock } from "../app/task-list";

export type Stage = ReturnType<typeof dictionary>["stage"];
export type View = "dashboard" | "tasks" | "note" | "courses" | "moodle";
type Icon = ComponentType<{ size?: number; className?: string }>;

/// Each Space's accent, as its chips and calendar items wear it.
const SPACE_COLORS = { studies: "#3b82f6", work: "#06b6d4", personal: "#22c55e" };
type SpaceName = keyof typeof SPACE_COLORS;

function spaceOf(space: string): SpaceName {
  return space === "personal" ? "personal" : space === "work" ? "work" : "studies";
}

/// The calendar's colour for each item: its Space's accent, or the Mensa's warm orange.
function toneColor(tone: string) {
  return tone === "green" ? "#22c55e" : tone === "orange" ? "#f59e0b" : "#3b82f6";
}

function statusOf(status: string) {
  return status === "done" ? "done" : status === "in_progress" ? "in_progress" : "todo";
}

/// The mascot, as the app draws it: a blob seeded with the day, smiling.
export function Mascot({ size, className }: { size: number; className?: string }) {
  return (
    <Blobatar
      name="Day_2026-11-19"
      size={size}
      expression={happy}
      animate="always"
      className={className}
    />
  );
}

/// One page of the app. `compact` is the phone.
export function PageView({
  view,
  t,
  locale,
  compact = false,
}: {
  view: View;
  t: Stage;
  locale: Locale;
  compact?: boolean;
}) {
  switch (view) {
    case "dashboard":
      return compact ? <PhoneHome t={t} /> : <Dashboard t={t} />;
    case "tasks":
      return <TaskListMock locale={locale} />;
    case "note":
      return <NotePageMock locale={locale} className={compact ? "p-4" : "px-10 py-8"} />;
    case "courses":
      return <SemesterMock locale={locale} className={compact ? "p-4" : "p-8"} />;
    case "moodle":
      return <MoodleMock locale={locale} />;
  }
}

type PanelRow = { key: string; title: string; space: string; due: string; status?: string };

/// The Dashboard as the desktop draws it (`DashboardView`): the briefing with the mascot
/// in the page's corner, then two columns, the tabbed panels on the left and today's
/// calendar on the right.
function Dashboard({ t }: { t: Stage }) {
  const p = t.panels;
  const rows = (list: PanelRow[], icon?: Icon) =>
    list.map((row) => (
      <EntityRow
        key={row.key}
        entityKey={row.key}
        title={row.title}
        space={t.spaces[spaceOf(row.space)]}
        color={SPACE_COLORS[spaceOf(row.space)]}
        due={row.due}
        icon={icon ? <IconGlyph icon={icon} /> : <StatusIcon status={statusOf(row.status ?? "")} />}
      />
    ));
  return (
    <div className="flex flex-col gap-3 px-6 pt-5 sm:px-8 sm:pt-6">
      <div className="flow-root">
        <Mascot size={96} className="float-right -mt-2 ml-4" />
        <Briefing t={t} />
      </div>
      <div className="grid grid-cols-1 gap-x-10 xl:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel icon={IconClipboardCheck} title={p.assignments.title} tabs={p.assignments.tabs}>
            {rows(p.assignments.rows)}
          </Panel>
          <Panel icon={IconTargetArrow} title={p.tasks.title} tabs={p.tasks.tabs}>
            {rows(p.tasks.rows)}
          </Panel>
          <Panel icon={IconCards} title={p.decks.title} tabs={p.decks.tabs}>
            {rows(p.decks.rows, IconCards)}
          </Panel>
          <Panel icon={IconFeather} title={p.jots.title} tabs={p.jots.tabs}>
            {rows(p.jots.rows, IconFeather)}
          </Panel>
        </div>
        <div className="hidden xl:block">
          <Calendar t={t} />
        </div>
      </div>
    </div>
  );
}

function IconGlyph({ icon: Icon }: { icon: Icon }) {
  return <Icon size={14} />;
}

/// The sentence the Dashboard opens with: the greeting, then the day in links.
function Briefing({ t, compact = false }: { t: Stage; compact?: boolean }) {
  const b = t.briefing;
  return (
    <p className={compact ? "text-[17px]/relaxed" : "text-xl/relaxed"}>
      <span className="font-semibold">{t.greeting}</span> <Filler>{b.lead}</Filler>{" "}
      <Token>📚 {b.sessions}</Token>
      <Filler>{b.afterSessions}</Filler> <Token>✅ {b.tasks}</Token> <Filler>{b.afterTasks}</Filler>{" "}
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 align-[0.1em] text-[0.85em]">
        <IconClipboardCheck size={14} className="text-muted-foreground" />
        {b.assignment}
      </span>{" "}
      <Filler>{b.end}.</Filler>
    </p>
  );
}

function Filler({ children }: { children: ReactNode }) {
  return <span className="text-foreground/45">{children}</span>;
}

function Token({ children }: { children: ReactNode }) {
  return (
    <span className="font-medium underline decoration-foreground/20 underline-offset-4">
      {children}
    </span>
  );
}

/// A Dashboard panel (`TabbedPanel`): its title and tabs on one bar over a hairline, the
/// first tab picked, then its rows.
function Panel({
  icon: Icon,
  title,
  tabs,
  children,
}: {
  icon: Icon;
  title: string;
  tabs: { label: string; count: number }[];
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-1 border-b border-border">
        <h2 className="mr-2 flex shrink-0 items-center gap-2 text-sm font-medium">
          <Icon size={14} className="text-muted-foreground" />
          {title}
        </h2>
        {tabs.map((tab, i) => (
          <span
            key={tab.label}
            className={cn(
              "-mb-px inline-flex h-8 items-center gap-1.5 border-b-2 px-2.5 text-sm font-medium whitespace-nowrap",
              i === 0
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            {tab.label}
            <span className="font-normal text-muted-foreground tabular-nums">{tab.count}</span>
          </span>
        ))}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/// A panel's row: the entity's key, its icon, its title, then its Space and due date.
function EntityRow({
  entityKey,
  title,
  icon,
  space,
  color,
  due,
}: {
  entityKey: string;
  title: string;
  icon: ReactNode;
  space: string;
  color: string;
  due: string;
}) {
  return (
    <div className="flex h-7 min-w-0 items-center gap-1 rounded-md">
      <span className="ml-1 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
        {entityKey}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 pr-2 text-sm">
        <span className="flex shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate">{title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 pr-2 text-xs text-muted-foreground">
        <SpaceChip name={space} color={color} />
        {due}
      </span>
    </div>
  );
}

/// The app's Space chip: the Space's colour as a dot on a tinted, outlined chip.
function SpaceChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-(--space-color)/40 bg-(--space-color)/10 px-1.5 py-0.5 text-xs text-foreground"
      // SAFETY: `--space-color` only ever receives one of `SPACE_COLORS`.
      style={{ "--space-color": color } as CSSProperties}
    >
      <span className="size-2 rounded-full bg-(--space-color)" />
      {name}
    </span>
  );
}

/// The hours the day view shows, and how tall one hour is in pixels.
const FIRST_HOUR = 8;
const LAST_HOUR = 20;
const HOUR = 52;

/// The demo's now, in hours: a quarter past nine, in the first lecture of the day.
const NOW = 9.25;

/// Today in the calendar, as the Dashboard's panel draws it (`TimeGrid`): hour rows,
/// each session outlined in its Space's colour, and the red line for now with its time.
function Calendar({ t }: { t: Stage }) {
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const y = (hour: number) => (hour - FIRST_HOUR) * HOUR;
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <div className="relative" style={{ height: y(LAST_HOUR) }}>
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute inset-x-0 flex border-t border-border first:border-t-0"
            style={{ top: y(hour), height: HOUR }}
          >
            <span className="w-14 shrink-0 px-1.5 pt-1 text-right text-xs text-muted-foreground tabular-nums">
              {`${hour}:00`}
            </span>
          </div>
        ))}
        {t.calendar.events.map((event) => (
          <div
            key={event.time}
            className="absolute right-1 left-14 flex flex-col overflow-hidden rounded-md border-2 border-(--session-color) bg-(--session-color)/6 px-1.5 py-0.5 text-xs text-foreground"
            // SAFETY: `--session-color` only ever receives one of `toneColor`'s colours.
            style={
              {
                top: y(event.start) + 1,
                height: (event.end - event.start) * HOUR - 2,
                "--session-color": toneColor(event.tone),
              } as CSSProperties
            }
          >
            <span className="flex min-w-0 items-center gap-1 font-medium">
              <CalendarGlyph course={event.course} />
              <span className="truncate">{event.title}</span>
            </span>
            {event.course && <span className="truncate">{event.course}</span>}
            <span className="truncate">{event.time}</span>
            <span className="truncate">{event.place}</span>
          </div>
        ))}
        {/* Now: a quarter past nine. */}
        <div className="absolute inset-x-0 z-20" style={{ top: y(NOW) }}>
          <div className="absolute inset-x-0 left-14 h-0.5 -translate-y-1/2 bg-destructive" />
          <span className="absolute left-1 w-12 -translate-y-1/2 rounded-sm bg-destructive py-px text-center text-xs font-medium text-white tabular-nums">
            9:15
          </span>
        </div>
      </div>
    </section>
  );
}

/// A class wears the Session icon, a personal entry the Calendar entry icon, as in the app.
function CalendarGlyph({ course }: { course: string }) {
  const Glyph = course ? IconChalkboard : IconCalendarEvent;
  return <Glyph size={11} className="shrink-0 text-(--session-color)" />;
}

/// A tinted, rounded square with a module's glyph, as the phone puts on its tiles and rows.
function IconBadge({ icon: Icon, tint }: { icon: Icon; tint: string }) {
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--tint)/15 text-(--tint)"
      // SAFETY: `--tint` only ever receives one of the fixed colours in this file.
      style={{ "--tint": tint } as CSSProperties}
    >
      <Icon size={16} />
    </span>
  );
}

const TILE_BADGES: [Icon, string][] = [
  [IconChecklist, "#3b82f6"],
  [IconClipboardList, "#f59e0b"],
  [IconCards, "#a855f7"],
  [IconFeather, "#14b8a6"],
];

/// The phone's Home (`HomeScreen`): the greeting, what is up next, the tiles at a glance,
/// today's agenda and the deadlines coming up, each section a grouped card.
function PhoneHome({ t }: { t: Stage }) {
  const ph = t.phone;
  // The first class after now (a quarter past nine), as Up next picks it.
  const next = t.calendar.events.find((event) => event.start > NOW);
  return (
    <div className="flex flex-col gap-5 px-4 pt-1 pb-8">
      <Briefing t={t} compact />
      {next && (
        <div className="flex gap-3 rounded-2xl bg-background p-4 shadow-xs">
          <span className="w-1 shrink-0 rounded-full bg-accent-blue" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex gap-2 text-[13px]">
              <span className="flex-1 font-semibold text-accent-blue uppercase">{ph.upNext}</span>
              <span className="font-medium text-muted-foreground">{ph.until}</span>
            </span>
            <span className="truncate text-[17px] font-semibold">
              {next.title}, {next.course}
            </span>
            <span className="truncate text-[15px] text-muted-foreground">
              {next.time}, {next.place}
            </span>
          </span>
        </div>
      )}
      <PhoneSection title={ph.glance}>
        <div className="grid grid-cols-2 gap-2.5">
          {ph.tiles.map((tile, i) => {
            // SAFETY: there is a badge for each of the four tiles.
            const [icon, tint] = TILE_BADGES[i] ?? TILE_BADGES[0]!;
            return (
              <div
                key={tile.label}
                className="flex flex-col gap-0.5 rounded-2xl bg-background p-3.5 shadow-xs"
              >
                <span className="mb-1.5 flex items-center justify-between">
                  <IconBadge icon={icon} tint={tint} />
                  <IconChevronRight size={16} className="text-muted-foreground/60" />
                </span>
                <span className="text-[28px]/tight font-bold tabular-nums">{tile.count}</span>
                <span className="truncate text-[15px] font-semibold">{tile.label}</span>
                <span className="truncate text-[13px] text-muted-foreground">{tile.detail}</span>
              </div>
            );
          })}
        </div>
      </PhoneSection>
      <PhoneSection title={ph.today}>
        <div className="overflow-hidden rounded-2xl bg-background shadow-xs">
          {t.calendar.events.map((event) => (
            <div
              key={event.time}
              className="flex min-h-12 items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
            >
              <span
                className="w-1 self-stretch rounded-full bg-(--tint)"
                // SAFETY: `--tint` only ever receives one of `toneColor`'s colours.
                style={{ "--tint": toneColor(event.tone) } as CSSProperties}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px]">{event.title}</span>
                <span className="truncate text-[13px] text-muted-foreground">
                  {event.time}, {event.place}
                </span>
              </span>
            </div>
          ))}
        </div>
      </PhoneSection>
      <PhoneSection title={ph.comingUp}>
        <div className="overflow-hidden rounded-2xl bg-background shadow-xs">
          {ph.deadlines.map((d, i) => (
            <div
              key={d.title}
              className="flex min-h-12 items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
            >
              <IconBadge
                icon={i === 0 ? IconClipboardList : IconCalendarStats}
                tint={i === 0 ? "#f59e0b" : "#ef4444"}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px]">{d.title}</span>
                <span className="truncate text-[13px] text-muted-foreground">{d.detail}</span>
              </span>
              <IconChevronRight size={16} className="text-muted-foreground/60" />
            </div>
          ))}
        </div>
      </PhoneSection>
    </div>
  );
}

/// A section of the phone's grouped page: its title over its card.
function PhoneSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-[20px] font-bold">{title}</h3>
      {children}
    </section>
  );
}
