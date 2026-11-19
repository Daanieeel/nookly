"use client";

import { useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconLoader2,
} from "@tabler/icons-react";
import { badgeVariants } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { STATUS_DATA_URL, SYNC_URL } from "@/lib/site";
import {
  COMPONENTS,
  type ComponentId,
  dayState,
  healthSchema,
  incidents,
  lastDays,
  type State,
  type StatusData,
  statusSchema,
  uptime,
} from "@/lib/status";

const LIVE_EVERY_MS = 60_000;

type Live =
  | { state: "checking" }
  | { state: "up"; version: string; ms: number }
  | { state: "down" };
type History = { state: "loading" } | { state: "ready"; data: StatusData } | { state: "failed" };

const BAR = {
  up: "bg-positive",
  degraded: "bg-warning",
  down: "bg-destructive",
  unknown: "bg-muted-foreground/20",
} satisfies Record<State, string>;

const BADGE = {
  up: "positive",
  degraded: "warning",
  down: "destructive",
  unknown: "neutral",
} satisfies Record<State, "positive" | "warning" | "destructive" | "neutral">;

/// Pings the sync server from this browser, now and every minute.
function useLiveSync(): Live {
  const [live, setLive] = useState<Live>({ state: "checking" });
  useEffect(() => {
    let stopped = false;
    async function ping() {
      const started = performance.now();
      try {
        const response = await fetch(`${SYNC_URL}/health`, { cache: "no-store" });
        const health = healthSchema.parse(await response.json());
        if (!stopped) {
          setLive({
            state: "up",
            version: health.version,
            ms: Math.round(performance.now() - started),
          });
        }
      } catch {
        if (!stopped) setLive({ state: "down" });
      }
    }
    void ping();
    const timer = setInterval(() => void ping(), LIVE_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  return live;
}

/// The history the checker keeps on the `status-data` branch.
function useHistory(): History {
  const [history, setHistory] = useState<History>({ state: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch(STATUS_DATA_URL, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const parsed = statusSchema.safeParse(body);
        setHistory(parsed.success ? { state: "ready", data: parsed.data } : { state: "failed" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistory({ state: "failed" });
      });
    return () => controller.abort();
  }, []);
  return history;
}

/// What a component is doing right now: a live answer from sync when this browser gets
/// one, otherwise the checker's last result. A failed ping from here may be the visitor's
/// own network, so it never marks anything down by itself.
function currentState(id: ComponentId, live: Live, data: StatusData | null): State {
  if (id === "sync" && live.state === "up") return "up";
  const last = data?.components[id]?.last;
  if (!last) return "unknown";
  return last.ok ? "up" : "down";
}

export function StatusBoard({ locale }: { locale: Locale }) {
  const t = dictionary(locale).status;
  const live = useLiveSync();
  const history = useHistory();
  const data = history.state === "ready" ? history.data : null;
  const states = COMPONENTS.map((id) => currentState(id, live, data));
  const checking = history.state === "loading" && live.state !== "up";
  const overall = checking
    ? "checking"
    : states.includes("down")
      ? states[0] === "down"
        ? "down"
        : "degraded"
      : states.every((s) => s === "unknown")
        ? "unknown"
        : "up";

  return (
    <div className="flex flex-col gap-6">
      <Banner locale={locale} overall={overall} updatedAt={data?.updatedAt ?? null} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {COMPONENTS.map((id, i) => (
          <ComponentRow
            key={id}
            id={id}
            locale={locale}
            // SAFETY: one state per component, in the same order.
            state={states[i]!}
            data={data}
            live={id === "sync" ? live : null}
          />
        ))}
      </section>

      {history.state === "failed" && (
        <p className="text-sm text-muted-foreground">{t.loadFailed}</p>
      )}

      <Incidents locale={locale} data={data} />

      <p className="text-xs text-muted-foreground">{t.updatedEvery}</p>
    </div>
  );
}

function Banner({
  locale,
  overall,
  updatedAt,
}: {
  locale: Locale;
  overall: State | "checking";
  updatedAt: string | null;
}) {
  const t = dictionary(locale).status;
  const title = {
    checking: t.checking,
    up: t.operational,
    degraded: t.degraded,
    down: t.down,
    unknown: t.unknown,
  }[overall];
  const Icon = {
    checking: IconLoader2,
    up: IconCircleCheckFilled,
    degraded: IconAlertTriangle,
    down: IconCircleXFilled,
    unknown: IconLoader2,
  }[overall];
  const tone = {
    checking: "border-border bg-card text-muted-foreground",
    up: "border-positive/30 bg-positive/10 text-positive",
    degraded: "border-warning/30 bg-warning/10 text-warning",
    down: "border-destructive/30 bg-destructive/10 text-destructive",
    unknown: "border-border bg-card text-muted-foreground",
  }[overall];
  const time = updatedAt
    ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(updatedAt))
    : null;
  return (
    <output className={cn("flex items-center gap-4 rounded-2xl border p-5 sm:px-6", tone)}>
      <Icon size={28} className={cn("shrink-0", overall === "checking" && "animate-spin")} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-lg font-semibold text-foreground sm:text-xl">
          {title}
        </span>
        {time && <span className="text-sm text-muted-foreground">{t.lastChecked(time)}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-positive" />
        </span>
        {t.live}
      </span>
    </output>
  );
}

function ComponentRow({
  id,
  locale,
  state,
  data,
  live,
}: {
  id: ComponentId;
  locale: Locale;
  state: State;
  data: StatusData | null;
  live: Live | null;
}) {
  const t = dictionary(locale).status;
  const history = data?.components[id];
  const days = lastDays(new Date());
  const percent = history ? uptime(history) : null;
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const dayFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const storedVersion = history?.last?.version;
  let detail: string | null = null;
  if (live?.state === "up")
    detail = `${t.version(live.version)} · ${t.responseTime(String(live.ms))}`;
  else if (storedVersion) detail = t.version(storedVersion);

  return (
    <div className="flex flex-col gap-3 border-t border-border p-5 first:border-t-0 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-sm font-medium">{t.components[id].name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {t.components[id].body}
            {detail && ` · ${detail}`}
          </span>
        </span>
        <span className={badgeVariants({ variant: BADGE[state], size: "md" })}>
          {t.states[state]}
        </span>
      </div>
      <div className="flex h-8 items-stretch gap-px sm:gap-0.5" aria-hidden>
        {days.map((day, i) => {
          const d = history?.days[day];
          const dayPercent = d && d.checks > 0 ? ((d.checks - d.down) / d.checks) * 100 : null;
          return (
            <span
              key={day}
              title={
                dayPercent === null
                  ? `${dayFormat.format(new Date(day))}: ${t.noData}`
                  : t.dayTooltip(dayFormat.format(new Date(day)), `${format.format(dayPercent)}%`)
              }
              className={cn(
                "min-w-0 flex-1 rounded-[2px] transition-opacity hover:opacity-70",
                BAR[dayState(d)],
                // Phones show the last 30 days, so a bar stays wide enough to see.
                i < days.length - 30 && "hidden sm:block",
              )}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          <span className="hidden sm:inline">{t.ago90}</span>
          <span className="sm:hidden">{t.ago30}</span>
        </span>
        <span>{percent === null ? t.noData : t.uptime(`${format.format(percent)}%`)}</span>
        <span>{t.today}</span>
      </div>
    </div>
  );
}

function Incidents({ locale, data }: { locale: Locale; data: StatusData | null }) {
  const t = dictionary(locale).status;
  const list = data ? incidents(data) : [];
  const dayFormat = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold">{t.incidents}</h2>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noIncidents}</p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
          {list.map((incident) => (
            <li
              key={`${incident.day}-${incident.component}`}
              className="flex items-center gap-3 border-t border-border px-5 py-3 text-sm first:border-t-0"
            >
              <IconAlertTriangle size={16} className="shrink-0 text-warning" />
              <span className="flex-1">{t.components[incident.component].name}</span>
              <span className="text-muted-foreground">
                {dayFormat.format(new Date(incident.day))} ·{" "}
                {t.incidentDay(`${incident.minutes} min`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
