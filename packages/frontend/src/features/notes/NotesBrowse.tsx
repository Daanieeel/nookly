import { IconPin } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { LabelChip } from "#/components/label-chip.tsx";
import { isCollapsed, toggleId } from "#/components/grouped-view/grouping.ts";
import { GroupSection } from "#/features/group-section.tsx";
import { displayTitle } from "#/lib/entity-title.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { prefetchBlocks } from "./blocks-query";
import type { NoteGroupBy } from "@nookly/shared/note-groups";
import { continueNotes, groupNotes } from "./note-groups";
import type { NoteProperty } from "./NotesDisplayMenu";
import type { NoteRow } from "./NotesListView";

const MAX_LABELS = 2;
const CONTINUE_LIMIT = 4;

/// What a Note opens with: hovering warms it, a right click gives the Note's own menu.
function useNoteOpen(row: NoteRow) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const { entity } = row.summary;
  return {
    type: "button" as const,
    onClick: () => openEntity(entity.id, entity.spaceId),
    onMouseEnter: () => prefetchBlocks(queryClient, entity.id),
    onFocus: () => prefetchBlocks(queryClient, entity.id),
    ...entityTarget(entity),
  };
}

type Hidden = NoteProperty[];

const shows = (property: NoteProperty, hidden: Hidden) => !hidden.includes(property);

function RowLabels({ row }: { row: NoteRow }) {
  const shown = row.labels.slice(0, MAX_LABELS);
  const extra = row.labels.length - shown.length;
  if (shown.length === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {shown.map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
      {extra > 0 && <span className="text-xs text-muted-foreground">+{extra}</span>}
    </span>
  );
}

/// A Note as a card: title, a few lines of what it says, its labels and when it changed.
/// `showCourse` names the Course, for cards that sit outside a Course group.
function NoteCard({
  row,
  hidden,
  showCourse,
}: {
  row: NoteRow;
  hidden: Hidden;
  showCourse?: boolean;
}) {
  const open = useNoteOpen(row);
  const { entity, courses, lastEditedAt } = row.summary;
  const course = courses[0];
  return (
    <button
      {...open}
      className={cn(
        "flex min-h-20 min-w-0 cursor-pointer flex-col gap-2 rounded-lg border border-border bg-raised p-3 text-left shadow-control transition-colors outline-none",
        "hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <EntityIcon entity={entity} size={16} className="shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{row.title}</span>
        {entity.pinned && <IconPin size={12} className="ml-auto shrink-0 text-muted-foreground" />}
      </span>
      {showCourse && course && (
        <span className="truncate text-xs text-muted-foreground">{displayTitle(course)}</span>
      )}
      {shows("preview", hidden) && (
        <span className="line-clamp-3 flex-1 text-xs text-muted-foreground">
          {row.preview || "Nothing written yet"}
        </span>
      )}
      <span className="mt-auto flex items-center gap-2">
        {shows("key", hidden) && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{entity.key}</span>
        )}
        {shows("labels", hidden) && <RowLabels row={row} />}
        {shows("edited", hidden) && (
          <time
            dateTime={lastEditedAt}
            className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
          >
            {formatEditedAt(lastEditedAt)}
          </time>
        )}
      </span>
    </button>
  );
}

/// A Note as one compact line.
function NoteLine({ row, hidden }: { row: NoteRow; hidden: Hidden }) {
  const open = useNoteOpen(row);
  const { entity, lastEditedAt } = row.summary;
  return (
    <button
      {...open}
      className="flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <EntityIcon entity={entity} size={16} className="shrink-0 text-muted-foreground" />
      {shows("key", hidden) && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{entity.key}</span>
      )}
      <span className="max-w-[40%] shrink-0 truncate font-medium">{row.title}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {shows("preview", hidden) ? row.preview : ""}
      </span>
      {shows("labels", hidden) && <RowLabels row={row} />}
      {shows("edited", hidden) && (
        <time
          dateTime={lastEditedAt}
          className="shrink-0 text-xs text-muted-foreground tabular-nums"
        >
          {formatEditedAt(lastEditedAt)}
        </time>
      )}
    </button>
  );
}

const CARD_GRID = "grid grid-cols-1 gap-3 py-3 @lg:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4";

/// The latest edits, to pick a Note up where it was left.
export function ContinueStrip({ rows, hidden }: { rows: NoteRow[]; hidden: Hidden }) {
  // With only a few Notes the groups below already show them all.
  if (rows.length <= CONTINUE_LIMIT) return null;
  const latest = continueNotes(rows, CONTINUE_LIMIT);
  return (
    <section aria-label="Continue" className="pb-2">
      <h2 className="text-sm font-medium">Continue</h2>
      <div className={CARD_GRID}>
        {latest.map((row) => (
          <NoteCard key={row.summary.entity.id} row={row} hidden={hidden} showCourse />
        ))}
      </div>
    </section>
  );
}

/// Every Note under Pinned and its Course (or label, or age), each group folding away on its
/// header.
export function GroupedNotes({
  rows,
  layout,
  groupBy,
  hidden,
}: {
  rows: NoteRow[];
  layout: "cards" | "list";
  groupBy: NoteGroupBy;
  hidden: Hidden;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return (
    <>
      {groupNotes(rows, groupBy).map((group) => (
        <GroupSection
          key={group.id}
          name={group.name}
          count={group.rows.length}
          collapsed={isCollapsed(collapsed, group.id, false)}
          onToggle={() => setCollapsed((prev) => toggleId(prev, group.id))}
        >
          {layout === "cards" ? (
            <div className={CARD_GRID}>
              {group.rows.map((row) => (
                <NoteCard key={row.summary.entity.id} row={row} hidden={hidden} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col py-1">
              {group.rows.map((row) => (
                <NoteLine key={row.summary.entity.id} row={row} hidden={hidden} />
              ))}
            </div>
          )}
        </GroupSection>
      ))}
    </>
  );
}
