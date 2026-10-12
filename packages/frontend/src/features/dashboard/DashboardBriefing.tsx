import type { ReactNode } from "react";
import { DashboardMascotCorner } from "./DashboardMascotCorner";
import { buildBriefing, type Clause, type Run } from "./briefing-clauses";
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

/// One-time narrative exception to the app's dense/utilitarian tone (§ Dashboard
/// briefing plan) — calmer typography, colorful inline glyphs, no Card/border.
/// Not a pattern for the rest of the app.
export function DashboardBriefing({ data }: { data: DashboardData }) {
  const open = useOpenTarget();
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

  return (
    <div className="flow-root">
      <DashboardMascotCorner />
      <p className="text-xl/relaxed text-foreground">
        <span className="font-semibold">{briefing.greeting}!</span>{" "}
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
    </div>
  );
}
