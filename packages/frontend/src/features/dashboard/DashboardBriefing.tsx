import type { ReactNode } from "react";
import { DashboardMascotCorner } from "./DashboardMascotCorner";
import { buildBriefing, type Clause } from "./briefing-clauses";
import type { DashboardData } from "./dashboard-data";
import { EntityPill, type LinkTarget, LinkToken, useOpenTarget } from "./dashboard-links";

/// Connective glue text (not the greeting, not a stat) rendered at lower
/// opacity so the eye lands on the greeting and the stat pills first.
function Filler({ children }: { children: ReactNode }) {
  return <span className="text-foreground/45">{children}</span>;
}

/// The clause's emoji rides inside its first clickable run rather than floating
/// as separate plain text. For a clause with no link (e.g. "your calendar's
/// clear"), the icon prefixes the plain text instead, since there's nothing to
/// click.
function renderClause(clause: Clause, open: (target: LinkTarget) => void): ReactNode {
  const hasLink = clause.runs.some((run) => run.kind !== "text");
  let iconPlaced = false;

  return (
    <span key={clause.key}>
      {!hasLink && <span className="mr-1">{clause.icon}</span>}
      {clause.runs.map((run, i) => {
        if (run.kind === "text") return <Filler key={i}>{run.text}</Filler>;
        const showIcon = !iconPlaced;
        iconPlaced = true;
        const icon = showIcon && <span className="mr-1">{clause.icon}</span>;
        if (run.kind === "name") {
          return (
            <span key={i}>
              {icon}
              <EntityPill title={run.text} onClick={() => open(run.target)} />
            </span>
          );
        }
        return (
          <LinkToken key={i} onClick={() => open(run.target)}>
            {icon}
            {run.text}
          </LinkToken>
        );
      })}
    </span>
  );
}

/// One-time narrative exception to the app's dense/utilitarian tone (§ Dashboard
/// briefing plan) — calmer typography, colorful inline glyphs, no Card/border.
/// Not a pattern for the rest of the app.
export function DashboardBriefing({ data }: { data: DashboardData }) {
  const open = useOpenTarget();
  const briefing = buildBriefing({
    sessions: data.todaySessions,
    tasks: data.tasks,
    deadlines: data.deadlines,
    jotCount: data.jotCount,
    jotSpaceIds: data.jots.map((j) => j.entity.spaceId),
    now: data.now,
  });
  const [sessionsClause, tasksClause, examsClause, assignmentsClause, jotsClause] =
    briefing.clauses;

  return (
    <div className="flow-root mb-8">
      <DashboardMascotCorner />
      <p className="text-2xl/relaxed text-foreground">
        <span className="font-semibold">{briefing.greeting}!</span>{" "}
        {renderClause(sessionsClause, open)}
        <Filler>{briefing.connectors[0]}</Filler>
        {renderClause(tasksClause, open)}
        <Filler>{briefing.connectors[1]}</Filler>
        {renderClause(examsClause, open)}
        <Filler>{briefing.connectors[2]}</Filler>
        {renderClause(assignmentsClause, open)}
        <Filler>{briefing.connectors[3]}</Filler>
        {renderClause(jotsClause, open)}
        <Filler>.</Filler>
      </p>
    </div>
  );
}
