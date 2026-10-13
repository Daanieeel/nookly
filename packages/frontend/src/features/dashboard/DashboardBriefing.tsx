import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { DashboardMascotCorner } from "./DashboardMascotCorner";
import { buildBriefing, type Clause, type Run } from "./briefing-clauses";
import { Button } from "@nookly/ui/components/button";
import { cn } from "@nookly/ui/lib/utils";
import type { DashboardData } from "./dashboard-data";
import { EntityPill, type LinkTarget, LinkToken, useOpenTarget } from "./dashboard-links";

/// Connective glue text (not the greeting, not a stat) rendered at lower
/// opacity so the eye lands on the greeting and the stat pills first.
function Filler({ children }: { children: ReactNode }) {
  return <span className="text-foreground/45">{children}</span>;
}

/// One run of the sentence: glue text, a clickable token or a name pill.
function renderRun(run: Run, key: number, open: (target: LinkTarget) => void, icon?: ReactNode) {
  if (run.kind === "text") return <Filler key={key}>{run.text}</Filler>;
  if (run.kind === "name") {
    return (
      <span key={key}>
        {icon}
        <EntityPill title={run.text} onClick={() => open(run.target)} />
      </span>
    );
  }
  return (
    <LinkToken key={key} onClick={() => open(run.target)}>
      {icon}
      {run.text}
    </LinkToken>
  );
}

/// The clause's emoji rides inside its first clickable run rather than floating
/// as separate plain text. A clause with no link prefixes its plain text instead.
function renderClause(clause: Clause, open: (target: LinkTarget) => void): ReactNode {
  const firstLink = clause.runs.findIndex((run) => run.kind !== "text");
  const icon = <span className="mr-1">{clause.icon}</span>;
  return (
    <span key={clause.key}>
      {firstLink === -1 && icon}
      {clause.runs.map((run, i) => renderRun(run, i, open, i === firstLink ? icon : undefined))}
    </span>
  );
}

/// Lines of the sentence shown before the rest is folded away behind "Show all".
const BRIEFING_LINES = 4;

/// Whether the text of `element` is cut off by its line clamp.
function useIsClamped(element: React.RefObject<HTMLElement | null>, sentence: string): boolean {
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return;
    const measure = () => setClamped(target.scrollHeight > target.clientHeight + 1);
    measure();
    if (!("ResizeObserver" in globalThis)) return;
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [element, sentence]);
  return clamped;
}

/// One-time narrative exception to the app's dense/utilitarian tone (§ Dashboard
/// briefing plan) — calmer typography, colorful inline glyphs, no Card/border.
/// Not a pattern for the rest of the app.
///
/// A long sentence (many Sessions, Tasks and named pills) stops at a few lines so the page
/// below keeps its room. The whole sentence is one click away.
export function DashboardBriefing({
  data,
  ref,
}: {
  data: DashboardData;
  ref?: Ref<HTMLDivElement>;
}) {
  const open = useOpenTarget();
  const sentence = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const briefing = buildBriefing({
    name: data.name,
    sessions: data.todaySessions,
    tasks: data.tasks,
    deadlines: data.deadlines,
    decks: data.studyDecks,
    jotCount: data.jotCount,
    oldestJotAt: data.jots[0]?.entity.createdAt ?? null,
    jotSpaceIds: data.jots.map((j) => j.entity.spaceId),
    now: data.now,
  });
  // The sentence changes with the facts behind it, which may change whether it overflows.
  const text = [
    briefing.greeting,
    ...briefing.lead.map((run) => run.text),
    briefing.bridge,
    ...briefing.clauses.flatMap((clause) => clause.runs.map((run) => run.text)),
  ].join("");
  const clamped = useIsClamped(sentence, text);

  return (
    <div ref={ref} className="flow-root">
      <DashboardMascotCorner />
      <p
        ref={sentence}
        id="dashboard-briefing"
        className={cn(
          "text-xl/relaxed text-foreground",
          !expanded && "line-clamp-(--briefing-lines)",
        )}
        // SAFETY: a plain number, which `CSSProperties` can't name as a custom property.
        style={{ "--briefing-lines": BRIEFING_LINES } as CSSProperties}
      >
        <span className="font-semibold">
          {briefing.greeting}
          {briefing.mark}
        </span>{" "}
        {briefing.lead.map((run, i) => renderRun(run, i, open))}
        <Filler>{briefing.bridge}</Filler>
        {briefing.clauses.map((clause, i) => (
          <span key={clause.key}>
            {i > 0 && <Filler>{briefing.connectors[i - 1]}</Filler>}
            {renderClause(clause, open)}
          </span>
        ))}
        <Filler>.</Filler>
      </p>
      {(clamped || expanded) && (
        <Button
          variant="muted"
          size="sm"
          className="mt-1 h-7 px-2"
          aria-expanded={expanded}
          aria-controls="dashboard-briefing"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show all"}
        </Button>
      )}
    </div>
  );
}
