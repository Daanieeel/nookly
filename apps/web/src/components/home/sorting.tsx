"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  IconClipboardCheck,
  IconFeather,
  IconLayoutDashboard,
  IconTargetArrow,
} from "@tabler/icons-react";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { AppFrame } from "../app/frame";
import { StatusIcon } from "../app/status-icon";
import { offsetWithin } from "../hero/stage";
import { EntityRow, Panel, SPACE_COLORS, spaceOf } from "../hero/stage-views";

/// How long each step of the scene lasts, in milliseconds: a pause before the first scrap
/// moves, then for each scrap its flight and a pause before the next one.
const STEPS = [600, 900, 500, 900, 500, 900];
const DONE = STEPS.length;
/// How long everything rests, filed on the Dashboard and loose again, between the runs.
const REST = 3500;
/// Backwards, each row fades out for this long before its scrap flies back, and each
/// flight back (with a breath after it) takes the other.
const FADE_OUT = 300;
const FLY_BACK = 1300;
const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
/// The flight out fades the scrap as it lands; the flight back shows it as it leaves.
const FLIGHT = `transform 900ms ${EASE}, opacity 350ms ease-in 550ms`;
const RETURN = `transform 900ms ${EASE}, opacity 250ms ease-out`;

/// How each loose scrap lies before it is filed, in degrees.
const TILT = [-1.5, -6, 4];
const PANEL_ICONS = [IconClipboardCheck, IconFeather, IconTargetArrow];

type Point = { x: number; y: number };

/// How long the scene shows `phase` before its next step, forwards or backwards. The
/// first step back starts right after the rest on the Dashboard, so it never waits here.
function delayOf(phase: number, back: boolean) {
  if (!back) return phase >= DONE ? REST : (STEPS[phase] ?? REST);
  if (phase === 0) return FLY_BACK + REST;
  return phase % 2 === 1 ? FADE_OUT : FLY_BACK;
}
type ScrapState = "loose" | "flying" | "filed";

/// The intro's picture of its own sentence: a Moodle notification, a sticky note and a
/// landlord's form lie loose, then fly one by one into the Dashboard, where each lands as
/// what it is (an Assignment, a Jot, a Task) and its panel counts it. After a rest it plays
/// backwards, the last one first, rests again and starts over, for as long as it is in
/// view. Reduced motion shows the end at once and holds it.
export function Sorting({ locale }: { locale: Locale }) {
  const t = dictionary(locale).intro.sorting;
  const spaces = dictionary(locale).stage.spaces;
  const root = useRef<HTMLDivElement>(null);
  const scraps = useRef<(HTMLDivElement | null)[]>([]);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const [{ phase, back }, setRun] = useState({ phase: 0, back: false });
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [flights, setFlights] = useState<Point[]>([]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setReduced(true);
  }, []);

  // Plays when it comes into view, and starts over once it has left the screen.
  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const seen = Boolean(entry?.isIntersecting);
        setVisible(seen);
        if (!seen) setRun({ phase: 0, back: false });
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !visible) return;
    const timer = window.setTimeout(
      () =>
        setRun((run) => {
          if (!run.back)
            return run.phase < DONE
              ? { ...run, phase: run.phase + 1 }
              : { phase: DONE - 1, back: true };
          return run.phase > 0 ? { ...run, phase: run.phase - 1 } : { phase: 1, back: false };
        }),
      delayOf(phase, back),
    );
    return () => window.clearTimeout(timer);
  }, [phase, back, visible, reduced]);

  // Where each scrap has to fly to land on its place, from layout offsets, so a scrap's
  // own tilt or flight does not change it.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      setFlights(
        scraps.current.map((scrap, i) => {
          const slot = slots.current[i];
          if (!scrap || !slot) return { x: 0, y: 0 };
          const from = offsetWithin(scrap, el);
          const to = offsetWithin(slot, el);
          return {
            x: to.x + slot.offsetWidth / 2 - (from.x + scrap.offsetWidth / 2),
            y: to.y + slot.offsetHeight / 2 - (from.y + scrap.offsetHeight / 2),
          };
        }),
      );
    };
    measure();
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shown = reduced ? DONE : phase;
  const stateOf = (i: number): ScrapState =>
    shown >= 2 * i + 2 ? "filed" : shown >= 2 * i + 1 ? "flying" : "loose";
  const scrap = (i: number, corners: string, className: string, content: ReactNode) => (
    <Scrap
      spot={(el) => {
        scraps.current[i] = el;
      }}
      state={stateOf(i)}
      back={back}
      flight={flights[i] ?? { x: 0, y: 0 }}
      tilt={TILT[i] ?? 0}
      corners={corners}
      className={className}
    >
      {content}
    </Scrap>
  );

  return (
    <div
      ref={root}
      aria-hidden
      className="mt-14 grid items-center gap-12 select-none sm:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-14"
    >
      <div className="flex flex-col items-center gap-8 lg:items-start">
        {scrap(0, "rounded-2xl", "w-full max-w-80", <Notification {...t.notification} />)}
        <div className="flex items-start gap-6 sm:gap-10 lg:pl-6">
          {scrap(1, "rounded-none", "mt-1", <Sticky text={t.sticky} />)}
          {scrap(2, "rounded-sm", "mt-8", <Form {...t.form} />)}
        </div>
      </div>

      <AppFrame icon={<IconLayoutDashboard />} title={t.window} className="w-full">
        <div className="flex flex-col gap-5 p-4 sm:p-5">
          {t.places.map((place, i) => {
            const landed = shown >= 2 * i + 2;
            // SAFETY: there is an icon for each of the three places.
            const icon = PANEL_ICONS[i] ?? PANEL_ICONS[0]!;
            const glyph = i === 1 ? <IconFeather size={14} /> : <StatusIcon status="todo" />;
            const row = (r: (typeof place)["added"]) => (
              <EntityRow
                entityKey={r.key}
                title={r.title}
                icon={glyph}
                space={spaces[spaceOf(r.space)]}
                color={SPACE_COLORS[spaceOf(r.space)]}
                due={r.due}
              />
            );
            return (
              <Panel
                key={place.panel}
                icon={icon}
                title={place.panel}
                tabs={[{ label: place.tab, count: place.count + (landed ? 1 : 0) }]}
              >
                <div
                  ref={(el) => {
                    slots.current[i] = el;
                  }}
                  data-place
                  data-placed={landed}
                  className={cn(
                    "rounded-md transition-opacity duration-300 motion-reduce:transition-none",
                    landed
                      ? "animate-[landed_1.6s_ease-out_both] opacity-100 motion-reduce:animate-none"
                      : "opacity-0",
                  )}
                >
                  {row(place.added)}
                </div>
                {row(place.existing)}
              </Panel>
            );
          })}
        </div>
      </AppFrame>
    </div>
  );
}

/// One loose scrap in its spot. The spot stays put; the scrap flies from it to its place
/// and leaves its dashed outline behind, tilted as it lay, so the gap it left shows.
function Scrap({
  spot,
  state,
  back,
  flight,
  tilt,
  corners,
  className,
  children,
}: {
  spot: (el: HTMLDivElement | null) => void;
  state: ScrapState;
  /// Playing backwards, so a loose scrap is on its way back to its spot.
  back: boolean;
  flight: Point;
  tilt: number;
  /// The scrap's own corners, which its outline keeps.
  corners: string;
  className: string;
  children: ReactNode;
}) {
  const gone = state !== "loose";
  return (
    <div ref={spot} className={cn("relative", className)}>
      <div
        data-outline={gone ? "shown" : "hidden"}
        className={cn(
          "absolute inset-0 border-2 border-dashed border-foreground/15 transition-opacity duration-500 motion-reduce:transition-none",
          corners,
          gone ? "opacity-100 delay-200" : back ? "opacity-0 delay-700" : "opacity-0 duration-0",
        )}
        style={{ transform: `rotate(${tilt}deg)` }}
      />
      <div
        data-scrap={state}
        className="relative z-10 will-change-transform"
        style={{
          transform: gone
            ? `translate(${flight.x}px, ${flight.y}px) rotate(0deg) scale(0.25)`
            : `rotate(${tilt}deg)`,
          opacity: gone ? 0 : 1,
          transition: gone ? FLIGHT : back ? RETURN : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/// A macOS notification banner, as Moodle's would arrive.
function Notification({
  app,
  time,
  title,
  body,
}: {
  app: string;
  time: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border/60 bg-background/90 p-3 text-[13px]/snug shadow-lg backdrop-blur">
      {/* oxlint-disable-next-line nextjs/no-img-element -- a static export has no image server */}
      <img
        src="/brands/moodle.svg"
        alt=""
        className="size-9 shrink-0 rounded-lg border border-border/60 bg-white p-1.5"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{app}</span>
          <span className="text-xs text-muted-foreground">{time}</span>
        </span>
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground">{body}</span>
      </div>
    </div>
  );
}

/// A yellow sticky note with a strip of tape, an idea written down in passing.
function Sticky({ text }: { text: string }) {
  return (
    <div className="relative flex size-40 items-center bg-[#fef08a] p-4 font-display text-lg/snug text-[#423b1d] shadow-md sm:size-44">
      <span className="absolute -top-2 left-1/2 h-5 w-14 -translate-x-1/2 rotate-3 bg-white/55 shadow-xs" />
      {text}
    </div>
  );
}

/// The first page of a PDF form, its fields still empty, with a note in pen.
function Form({
  name,
  title,
  fields,
  note,
}: {
  name: string;
  title: string;
  fields: readonly string[];
  note: string;
}) {
  return (
    <div className="flex w-40 flex-col gap-2.5 rounded-sm bg-white p-3.5 text-neutral-800 shadow-md sm:w-44">
      <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
        <span className="rounded-sm bg-red-600 px-1 text-[9px] font-bold text-white">PDF</span>
        <span className="truncate">{name}</span>
      </span>
      <span className="text-sm font-semibold">{title}</span>
      {fields.map((field) => (
        <span key={field} className="flex flex-col gap-1 text-[10px] text-neutral-500">
          {field}
          <span className="h-px bg-neutral-300" />
        </span>
      ))}
      <span className="-rotate-2 font-display text-xs text-blue-700 italic">{note}</span>
    </div>
  );
}
