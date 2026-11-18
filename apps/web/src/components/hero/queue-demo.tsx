"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  IconCalendarDue,
  IconCheck,
  IconCircleCheckFilled,
  IconLoader2,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconSchool,
  IconSparkles,
  IconToolsKitchen2,
} from "@tabler/icons-react";
import { badgeVariants, buttonVariants } from "@nookly/ui/classes";
import { Kbd } from "@nookly/ui/components/kbd";
import { Separator } from "@nookly/ui/components/separator";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";

type Phase = "idle" | "working" | "done" | "accepted" | "leave";
type Target = "action" | "agent";
type Frame = { ms: number; phase: Phase; step?: number; cursor?: Target; pressed?: Target };

/// How each card plays out: the agent takes the first and the last, the second is added
/// by hand. Times in milliseconds.
const AGENT: Frame[] = [
  { ms: 1700, phase: "idle" },
  { ms: 950, phase: "idle", cursor: "agent" },
  { ms: 300, phase: "idle", cursor: "agent", pressed: "agent" },
  { ms: 950, phase: "working", step: 0 },
  { ms: 950, phase: "working", step: 1 },
  { ms: 950, phase: "working", step: 2 },
  { ms: 2400, phase: "done" },
  { ms: 650, phase: "leave" },
];
const BY_HAND: Frame[] = [
  { ms: 1700, phase: "idle" },
  { ms: 950, phase: "idle", cursor: "action" },
  { ms: 300, phase: "idle", cursor: "action", pressed: "action" },
  { ms: 500, phase: "accepted" },
  { ms: 650, phase: "leave" },
];
const SCRIPTS = [AGENT, BY_HAND, AGENT];
const ALL_DONE_MS = 3600;

const SOURCE_ICONS: ReactNode[] = [
  // oxlint-disable-next-line nextjs/no-img-element -- a static export has no image server
  <img key="moodle" src="/brands/moodle.svg" alt="" className="size-6" />,
  <IconSchool key="campus" size={20} className="text-accent-blue" />,
  <IconToolsKitchen2 key="mensa" size={20} className="text-warning" />,
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const listener = () => setReduced(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  return reduced;
}

/// The hero's demo: what an agent routine found this morning, worked through one card at
/// a time, as getsymmetry.com does it. Everything is drawn with the app's own classes.
export function QueueDemo({ locale }: { locale: Locale }) {
  const t = dictionary(locale).queue;
  const controls = dictionary(locale).hero;
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const [card, setCard] = useState(0);
  const [frame, setFrame] = useState(0);
  const finished = card >= SCRIPTS.length;
  const script = SCRIPTS[card] ?? [];
  const current: Frame = script[frame] ?? { ms: ALL_DONE_MS, phase: "idle" };

  useEffect(() => {
    if (reduced) setPaused(true);
  }, [reduced]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => {
      if (finished) {
        setCard(0);
        setFrame(0);
      } else if (frame + 1 < script.length) {
        setFrame(frame + 1);
      } else {
        setCard(card + 1);
        setFrame(0);
      }
    }, current.ms);
    return () => window.clearTimeout(timer);
  }, [paused, card, frame, finished, script.length, current.ms]);

  const progress = finished ? 100 : ((card + (frame + 1) / script.length) / SCRIPTS.length) * 100;
  const remaining = Math.max(0, SCRIPTS.length - card - 1);

  return (
    <div className="relative mx-auto w-full max-w-[640px]">
      <div className="relative">
        {/* The rest of the queue, peeking out under the card. */}
        {[0, 1].map((i) => (
          <div
            key={i}
            aria-hidden
            className={cn(
              "absolute inset-x-0 top-0 h-full rounded-xl border border-border bg-card shadow-md transition-all duration-500",
              i < remaining ? "opacity-100" : "opacity-0",
            )}
            style={{
              transform: `translateY(${(i + 1) * 13}px) scale(${1 - (i + 1) * 0.045})`,
              zIndex: 1 - i,
            }}
          />
        ))}
        <div className="relative z-10">
          {finished ? (
            <AllDone title={t.allDone} body={t.allDoneBody} />
          ) : (
            <QueueCard key={card} locale={locale} index={card} frame={current} />
          )}
        </div>
      </div>
      <div className="mt-12 flex justify-center">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? controls.play : controls.pause}
          title={paused ? controls.play : controls.pause}
          className="flex h-7 items-center gap-2 rounded-full border border-border bg-card/80 px-2.5 text-muted-foreground shadow-xs backdrop-blur transition-colors hover:text-foreground"
        >
          {paused ? <IconPlayerPlayFilled size={12} /> : <IconPlayerPauseFilled size={12} />}
          <span className="relative h-1 w-16 overflow-hidden rounded-full bg-foreground/10">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/50 transition-[width] duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </span>
        </button>
      </div>
    </div>
  );
}

function AllDone({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[248px] animate-[card-in_0.5s_cubic-bezier(0.16,1,0.3,1)_both] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card/70 px-6 text-center shadow-xl backdrop-blur">
      <span className="mb-1 flex size-9 items-center justify-center rounded-full bg-positive/15 text-positive">
        <IconCheck size={18} stroke={2.5} />
      </span>
      <p className="font-display text-base font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

const ACTION = cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-8 gap-1.5 pr-1.5");

function QueueCard({ locale, index, frame }: { locale: Locale; index: number; frame: Frame }) {
  const t = dictionary(locale).queue;
  // SAFETY: `index` is below SCRIPTS.length, which matches the three cards.
  const item = t.cards[index]!;
  const cardRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLSpanElement>(null);
  const agentRef = useRef<HTMLSpanElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const target =
      frame.cursor === "agent"
        ? agentRef.current
        : frame.cursor === "action"
          ? actionRef.current
          : null;
    const box = cardRef.current;
    if (!target || !box) {
      setCursor(null);
      return;
    }
    const a = target.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    setCursor({ x: a.left - b.left + a.width * 0.55, y: a.top - b.top + a.height * 0.6 });
  }, [frame.cursor]);

  const working = frame.phase === "working" || frame.phase === "done";
  const leaving = frame.phase === "leave";
  const accepted = frame.phase === "accepted" || (leaving && SCRIPTS[index] === BY_HAND);

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative min-h-[248px] animate-[card-in_0.55s_cubic-bezier(0.16,1,0.3,1)_both] overflow-hidden rounded-xl border border-border bg-card p-5 text-left shadow-xl transition-[transform,opacity,background-color,border-color] duration-[650ms] ease-[cubic-bezier(0.4,0,0.2,1)] sm:p-6",
        accepted &&
          "border-positive/40 bg-[color-mix(in_oklab,var(--accent-green)_9%,var(--card))]",
        leaving && "translate-x-[115%] rotate-[7deg] opacity-0",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          {SOURCE_ICONS[index]}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">{item.source}</span>
          <span className="truncate text-xs text-muted-foreground">{item.context}</span>
        </span>
        {working ? (
          frame.phase === "done" ? (
            <span className={cn(badgeVariants({ variant: "positive", size: "md" }), "gap-1")}>
              <IconCheck size={12} stroke={2.5} />
              {t.done}
            </span>
          ) : (
            <span className={cn(badgeVariants({ variant: "primary", size: "md" }), "gap-1")}>
              <IconSparkles size={12} />
              {t.working}
            </span>
          )
        ) : (
          <span className={cn(badgeVariants({ variant: "warning", size: "md" }), "gap-1")}>
            <IconCalendarDue size={12} />
            {item.priority}
          </span>
        )}
      </div>

      <h3 className="mt-4 font-display text-lg leading-snug font-semibold">{item.title}</h3>

      {working ? (
        <AgentSteps item={item} frame={frame} justNow={t.justNow} added={t.added} />
      ) : (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <SpaceChip name={item.chips[0] ?? ""} />
            <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-foreground/10 px-1.5 text-xs text-muted-foreground">
              <IconCalendarDue size={13} className="text-warning" />
              {item.chips[1]}
            </span>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-wrap items-center gap-2">
            <span
              ref={actionRef}
              className={cn(
                ACTION,
                "border-positive/50 bg-positive/10 text-positive",
                frame.pressed === "action" && "scale-95 bg-positive/25",
              )}
            >
              <IconCheck />
              {item.action}
              <Kbd className="bg-positive/15 text-positive">A</Kbd>
            </span>
            <span className={ACTION}>
              {t.skip}
              <Kbd>S</Kbd>
            </span>
            <span
              ref={agentRef}
              className={cn(
                ACTION,
                "ml-auto border-primary/40 bg-primary/10 text-primary",
                frame.pressed === "agent" && "scale-95 bg-primary/25",
              )}
            >
              <IconSparkles />
              {t.agentButton}
              <Kbd className="bg-primary/15 text-primary">H</Kbd>
            </span>
          </div>
        </>
      )}

      <Cursor at={cursor} pressed={Boolean(frame.pressed)} />
    </div>
  );
}

function AgentSteps({
  item,
  frame,
  justNow,
  added,
}: {
  item: { steps: string[]; skill: string; result: string; source: string };
  frame: Frame;
  justNow: string;
  added: string;
}) {
  const done = frame.phase === "done";
  const active = frame.step ?? 0;
  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {item.steps.map((step, i) => {
        const state = done || i < active ? "done" : i === active ? "active" : "waiting";
        return (
          <div
            key={step}
            className={cn(
              "flex animate-[fade-up_0.4s_ease-out_both] items-center gap-2.5 text-sm",
              state === "waiting" ? "text-muted-foreground" : "text-foreground",
            )}
            style={{ animationDelay: `${i * 90}ms` } as CSSProperties}
          >
            {state === "done" ? (
              <IconCircleCheckFilled size={18} className="shrink-0 text-positive" />
            ) : state === "active" ? (
              <IconLoader2 size={18} className="shrink-0 animate-spin text-primary" />
            ) : (
              <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-foreground/20" />
            )}
            {step}
            {i === item.steps.length - 1 && state !== "waiting" && (
              <span className={cn(badgeVariants({ variant: "neutral", size: "sm" }), "gap-1")}>
                <IconSparkles size={11} />
                {item.skill}
              </span>
            )}
          </div>
        );
      })}
      {done && (
        <div className="mt-1.5 flex animate-[fade-up_0.4s_ease-out_both] items-center gap-2 rounded-md border border-positive/40 bg-positive/10 px-3 py-2 text-sm">
          <IconCircleCheckFilled size={16} className="shrink-0 text-positive" />
          <span className="min-w-0 truncate font-medium">{item.result}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{justNow}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-positive">
            <IconCheck size={12} stroke={2.5} />
            {added}
          </span>
        </div>
      )}
    </div>
  );
}

/// A Space as the desktop's cards show it: its colour as a dot on a tinted chip.
function SpaceChip({ name }: { name: string }) {
  return (
    <span
      className="flex h-6 items-center gap-1.5 rounded-md border border-(--space-color)/40 bg-(--space-color)/10 px-1.5 text-xs"
      style={{ "--space-color": "#0070f3" } as CSSProperties}
    >
      <span className="size-2 rounded-full bg-(--space-color)" />
      {name}
    </span>
  );
}

function Cursor({ at, pressed }: { at: { x: number; y: number } | null; pressed: boolean }) {
  return (
    <svg
      aria-hidden
      width="22"
      height="22"
      viewBox="0 0 24 24"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-20 drop-shadow-md transition-[transform,opacity] duration-[900ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
        at ? "opacity-100" : "opacity-0",
      )}
      style={{
        transform: at
          ? `translate(${at.x}px, ${at.y}px) scale(${pressed ? 0.85 : 1})`
          : "translate(60%, 120%)",
      }}
    >
      <path
        d="M5 3.2 19.2 12l-6.4 1.3 3.6 6.6-2.6 1.4-3.6-6.6L5.6 19z"
        className="fill-foreground stroke-card"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
