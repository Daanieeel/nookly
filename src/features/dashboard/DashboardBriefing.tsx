import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { listAssignmentsAllSpaces } from "@/lib/api/assignments";
import { listExamsAllSpaces } from "@/lib/api/exams";
import { countJotsWithoutRefinementAllSpaces } from "@/lib/api/notes";
import { listSessionsToday } from "@/lib/api/sessions";
import { countOpenTasksDueOrOverdue } from "@/lib/api/tasks";
import { buildBriefing, type Clause } from "./briefing-clauses";

/// Connective glue text (not the greeting, not a stat) rendered at lower
/// opacity so the eye lands on the greeting and the stat pills first.
function Filler({ children }: { children: ReactNode }) {
  return <span className="text-foreground/45">{children}</span>;
}

/// The clause's emoji rides inside its first clickable stat rather than floating
/// as separate plain text — for a clause with no stat (e.g. "your calendar's
/// clear"), the icon prefixes the plain text instead, since there's nothing to
/// click.
function renderClause(clause: Clause): ReactNode {
  const hasStat = clause.runs.some((run) => run.kind === "bold");
  let iconPlaced = false;

  return (
    <span key={clause.key}>
      {!hasStat && <span className="mr-1">{clause.icon}</span>}
      {clause.runs.map((run, i) => {
        if (run.kind === "text") return <Filler key={i}>{run.text}</Filler>;
        const showIcon = !iconPlaced;
        iconPlaced = true;
        return (
          <button key={i} type="button" className="cursor-pointer font-semibold text-foreground">
            {showIcon && <span className="mr-1">{clause.icon}</span>}
            {run.text}
          </button>
        );
      })}
    </span>
  );
}

/// One-time narrative exception to the app's dense/utilitarian tone (§ Dashboard
/// briefing plan) — calmer typography, colorful inline glyphs, no Card/border.
/// Not a pattern for the rest of the app.
export function DashboardBriefing() {
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-today"],
    queryFn: listSessionsToday,
  });
  const { data: openTaskCount = 0 } = useQuery({
    queryKey: ["open-tasks-due-or-overdue"],
    queryFn: countOpenTasksDueOrOverdue,
  });
  const { data: exams = [] } = useQuery({ queryKey: ["exams-all"], queryFn: listExamsAllSpaces });
  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments-all"],
    queryFn: listAssignmentsAllSpaces,
  });
  const { data: jotCount = 0 } = useQuery({
    queryKey: ["jots-without-refinement-all"],
    queryFn: countJotsWithoutRefinementAllSpaces,
  });

  const briefing = buildBriefing({ sessions, openTaskCount, exams, assignments, jotCount });
  const [sessionsClause, tasksClause, examsClause, assignmentsClause, jotsClause] =
    briefing.clauses;

  return (
    <div className="mb-8">
      <p className="text-2xl leading-relaxed text-foreground">
        <span className="font-semibold">{briefing.greeting}!</span> {renderClause(sessionsClause)}
        <Filler>{briefing.connectors[0]}</Filler>
        {renderClause(tasksClause)}
        <Filler>{briefing.connectors[1]}</Filler>
        {renderClause(examsClause)}
        <Filler>{briefing.connectors[2]}</Filler>
        {renderClause(assignmentsClause)}
        <Filler>{briefing.connectors[3]}</Filler>
        {renderClause(jotsClause)}
        <Filler>.</Filler>
      </p>
    </div>
  );
}
