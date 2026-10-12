import { IconArrowRight, IconFeather, IconSparkles } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  statusTextClass,
} from "#/components/action-feedback.tsx";
import { EntityKeyCopyInline } from "#/components/entity-key.tsx";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { Button } from "@nookly/ui/components/button";
import { previewLines } from "#/features/notes/note-preview.ts";
import { refineJotIntoNote } from "#/features/notes/refine-jot.ts";
import type { PageSummary } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";
import type { DashboardData } from "./dashboard-data";
import { EmptyRow, Panel, ShowMore } from "./DashboardPanel";
import { entityLink, listLink, useOpenTarget } from "./dashboard-links";

function jotSnippet(jot: PageSummary): string {
  const lines = previewLines(jot.preview);
  if (jot.entity.title.trim()) {
    const title = displayTitle(jot.entity);
    const body = lines.filter((l) => l.toLowerCase() !== title.toLowerCase()).join(" ");
    return body ? `${title}: ${body}` : title;
  }
  return lines.join(" ") || "Empty Jot";
}

function RefineButton({ jot }: { jot: PageSummary }) {
  const queryClient = useQueryClient();
  const refine = useMutation({ mutationFn: () => refineJotIntoNote(jot.entity, queryClient) });
  const status = statusOf(refine);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={refine.isPending}
        onClick={() => refine.mutate()}
        className="h-7 shrink-0 gap-1 px-2"
      >
        <StatusIcon status={status} idle={<IconArrowRight size={14} />} />
        <span className={statusTextClass(status)}>{status === "error" ? "Retry" : "Refine"}</span>
      </Button>
      <StatusAnnouncer
        message={
          status === "pending"
            ? "Refining Jot"
            : status === "error"
              ? "Couldn't create Note, try again"
              : null
        }
      />
    </>
  );
}

function JotRow({ jot }: { jot: PageSummary }) {
  const open = useOpenTarget();
  const snippet = jotSnippet(jot);
  return (
    <div className="flex h-8 min-w-0 items-center gap-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5">
      <EntityKeyCopyInline entityKey={jot.entity.key} className="ml-1" />
      <button
        type="button"
        onClick={() => open(entityLink(jot.entity.id, jot.entity.spaceId))}
        {...entityTarget(jot.entity)}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center px-2 text-left"
      >
        <span
          className={cn(
            "truncate text-sm",
            snippet === "Empty Jot" && "text-muted-foreground italic",
          )}
        >
          {snippet}
        </span>
      </button>
      <RefineButton jot={jot} />
    </div>
  );
}

/// The oldest Jots still waiting to be refined, the most overdue first.
export function JotsPanel({ data }: { data: DashboardData }) {
  const open = useOpenTarget();
  const { jots, jotCount } = data;
  return (
    <Panel
      icon={IconFeather}
      title="Jots"
      action={
        jotCount > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{jotCount}</span>
        )
      }
    >
      {jots.length === 0 && (
        <EmptyRow icon={IconSparkles}>Nothing waiting. Every Jot is refined.</EmptyRow>
      )}
      <div className="flex flex-col">
        {jots.map((jot) => (
          <JotRow key={jot.entity.id} jot={jot} />
        ))}
      </div>
      <ShowMore
        count={jotCount - jots.length}
        onClick={() =>
          open(
            listLink(
              "jots",
              jots.map((j) => j.entity.spaceId),
            ),
          )
        }
      />
    </Panel>
  );
}
