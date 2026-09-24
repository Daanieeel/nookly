import {
  IconChecklist,
  IconCircleDashed,
  IconFileText,
  IconLink,
  IconPlus,
  IconUnlink,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FieldError, StatusIcon, statusOf } from "@/components/action-feedback";
import { entityTarget } from "@/components/context-menu/registry";
import { EntityIcon } from "@/components/entity-icon";
import { EntityKey, EntityKeyCopyInline } from "@/components/entity-key";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskDueControl, TaskStatusControl, useTasksData } from "@/features/tasks/task-controls";
import { PendingIcon, TaskStatusIcon } from "@/features/tasks/task-properties";
import { listEntities } from "@/lib/api/entities";
import { createNote } from "@/lib/api/notes";
import { createRelationship, deleteRelationship, listRelationships } from "@/lib/api/relationships";
import { createTask, listTasks } from "@/lib/api/tasks";
import type { Entity, Relationship } from "@/lib/api/types";
import { matchesKey } from "@/lib/entity-key";
import { displayTitle } from "@/lib/entity-title";
import { preferences } from "@/lib/preferences";
import { formatEditedAt } from "@/lib/relative-time";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";

const NOTE_TYPES = ["note", "jot"];

/// A page specific tab after Tasks and Notes, like an Exam's Decks.
export interface ExtraTab {
  id: string;
  label: string;
  icon: ReactNode;
  count: number;
  /// Singular, for the buttons: "Deck" gives "New Deck" and "Add deck".
  noun: string;
  rows: ReactNode;
  /// The inline form for a new item; `done` closes it.
  renderAdd?: (done: () => void) => ReactNode;
}

/// The id at the other end of a `relates-to` link, whichever way it points.
function otherEnd(link: Relationship, selfId: string): string {
  return link.fromEntityId === selfId ? link.toEntityId : link.fromEntityId;
}

/// Where a Task's sub-tasks would be: the Tasks and Notes linked to `entity`
/// through `relates-to`, one tab each, with ways to link an existing one or
/// create a new one already linked, plus any `extraTabs` the page brings.
export function RelatedItemsSection({
  entity: owner,
  extraTabs = [],
}: {
  entity: Entity;
  extraTabs?: ExtraTab[];
}) {
  const queryClient = useQueryClient();
  const { spaceId } = owner;
  const tabIds = ["tasks", "notes", ...extraTabs.map((t) => t.id)];
  const [tab, setTabState] = useState(() => {
    const stored = preferences.get(STORAGE_KEYS.relatedTab);
    return stored && tabIds.includes(stored) ? stored : "tasks";
  });
  const extra = extraTabs.find((t) => t.id === tab);
  const [adding, setAdding] = useState(false);
  const { kindOf, statusById } = useTasksData();
  const isFinished = (statusId: string) => {
    const kind = kindOf(statusId);
    return kind === "completed" || kind === "canceled";
  };

  const { data: links = [] } = useQuery({
    queryKey: ["relationships", owner.id],
    queryFn: () => listRelationships(owner.id, "both"),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", spaceId],
    queryFn: () => listTasks(spaceId),
  });
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", spaceId],
    queryFn: () => listEntities(spaceId, false),
  });

  const related = links.filter((l) => l.relationshipType === "relates-to");
  const linkFor = new Map(related.map((l) => [otherEnd(l, owner.id), l]));
  const relatedTasks = tasks.filter((t) => linkFor.has(t.entity.id));
  const notes = entities.filter((e) => NOTE_TYPES.includes(e.type));
  const relatedNotes = notes.filter((n) => linkFor.has(n.id));
  const taskById = new Map(tasks.map((t) => [t.entity.id, t]));

  const createLinkedTask = async (title: string) => {
    const task = await createTask(spaceId, title, null, null);
    await queryClient.invalidateQueries({ queryKey: ["tasks", spaceId] });
    return task.entity.id;
  };
  const createLinkedNote = async (title: string) => {
    const note = await createNote(spaceId, title);
    await queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
    return note.id;
  };
  const counts = new Map([
    ["tasks", relatedTasks.length],
    ["notes", relatedNotes.length],
    ...extraTabs.map((t): [string, number] => [t.id, t.count]),
  ]);

  const setTab = (next: string) => {
    setTabState(next);
    setAdding(false);
    preferences.set(STORAGE_KEYS.relatedTab, next);
  };
  const tabs = [
    { id: "tasks", label: "Tasks", icon: <IconChecklist size={14} /> },
    { id: "notes", label: "Notes", icon: <IconFileText size={14} /> },
    ...extraTabs,
  ];

  const refreshLinks = (otherId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["relationships", owner.id] }),
      queryClient.invalidateQueries({ queryKey: ["relationships", otherId] }),
    ]);

  const link = useMutation({
    mutationFn: async (other: Entity) => {
      await createRelationship(owner.id, other.id, "relates-to");
      await refreshLinks(other.id);
    },
  });
  const linkStatus = link.isSuccess ? "idle" : statusOf(link);

  const noun = extra?.noun ?? (tab === "tasks" ? "Task" : "Note");
  const canAdd = !extra || !!extra.renderAdd;
  const linked = new Set(linkFor.keys());

  return (
    <section aria-label="Related" className="mt-10 flex flex-col">
      <div className="flex h-9 items-center gap-1 border-b border-border">
        <nav aria-label="Related items" className="-ml-2 flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
                tab === t.id && "border-border bg-accent text-foreground",
              )}
            >
              {t.icon}
              {t.label}
              <span className="text-muted-foreground tabular-nums">{counts.get(t.id)}</span>
            </button>
          ))}
        </nav>
        <span className="flex-1" />
        {!extra && (
          <Tooltip>
            <EntityPickerPopover
              spaceId={spaceId}
              typeFilter={tab === "tasks" ? "task" : NOTE_TYPES}
              exclude={owner.id}
              onSelect={(entity) => !linked.has(entity.id) && link.mutate(entity)}
              trigger={
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={
                      linkStatus === "error" ? "Couldn't link, try again" : `Link ${noun}`
                    }
                    className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
                  >
                    <StatusIcon status={linkStatus} idle={<IconLink size={14} />} />
                  </button>
                </TooltipTrigger>
              }
            />
            <TooltipContent>Link {noun}</TooltipContent>
          </Tooltip>
        )}
        {canAdd && <IconButton label={`New ${noun}`} onClick={() => setAdding(true)} />}
      </div>

      {extra
        ? extra.rows
        : tab === "tasks"
          ? relatedTasks.map((task) => (
              <RelatedRow
                key={task.entity.id}
                entity={task.entity}
                link={linkFor.get(task.entity.id)}
                onUnlinked={refreshLinks}
                leading={<TaskStatusControl task={task} />}
                trailing={<TaskDueControl task={task} />}
                struck={isFinished(task.statusId)}
              />
            ))
          : relatedNotes.map((note) => (
              <RelatedRow
                key={note.id}
                entity={note}
                link={linkFor.get(note.id)}
                onUnlinked={refreshLinks}
                leading={<NoteGlyph note={note} />}
                trailing={
                  <span className="pointer-events-none relative shrink-0 text-xs text-muted-foreground">
                    {formatEditedAt(note.updatedAt)}
                  </span>
                }
              />
            ))}
      {adding && extra?.renderAdd ? (
        extra.renderAdd(() => setAdding(false))
      ) : adding && !extra ? (
        <RelatedAddInput
          // Remount per tab, so the typed text and picked row start fresh.
          key={tab}
          owner={owner}
          noun={tab === "tasks" ? "task" : "note"}
          candidates={
            tab === "tasks"
              ? tasks.filter((t) => !linkFor.has(t.entity.id)).map((t) => t.entity)
              : notes.filter((n) => !linkFor.has(n.id))
          }
          leadingFor={(entity) => {
            if (tab === "notes") return <NoteGlyph note={entity} />;
            const task = taskById.get(entity.id);
            const status = task && statusById.get(task.statusId);
            return status && <TaskStatusIcon status={status} kind={kindOf(status.id)} />;
          }}
          create={tab === "tasks" ? createLinkedTask : createLinkedNote}
          onLinked={refreshLinks}
          onDone={() => setAdding(false)}
        />
      ) : (
        counts.get(tab) === 0 &&
        canAdd && (
          <EmptyRow
            label={extra ? `Add ${noun.toLowerCase()}` : `Add or link ${noun.toLowerCase()}`}
            onClick={() => setAdding(true)}
          />
        )
      )}
    </section>
  );
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <IconPlus size={14} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function EmptyRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <IconPlus size={14} />
      {label}
    </button>
  );
}

/// One linked item: the whole row opens it, and with `link` and `onUnlinked` a
/// hover button removes the link (the item itself stays).
export function RelatedRow({
  entity,
  link,
  onUnlinked,
  leading,
  trailing,
  struck = false,
}: {
  entity: Entity;
  link?: Relationship;
  onUnlinked?: (otherId: string) => Promise<void[]>;
  leading: ReactNode;
  trailing: ReactNode;
  struck?: boolean;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  const unlink = useMutation({
    mutationFn: async () => {
      if (link) await deleteRelationship(link.id);
      await onUnlinked?.(entity.id);
    },
  });
  const title = displayTitle(entity);
  return (
    <div
      className="group/row relative flex h-10 items-center gap-2 border-b border-border/60 px-1 hover:bg-accent/40"
      {...entityTarget(entity)}
    >
      <button
        type="button"
        aria-label={`Open ${title}`}
        onClick={() => openEntity(entity.id, entity.spaceId)}
        className="absolute inset-0 cursor-pointer outline-none focus-visible:bg-accent/50"
      />
      <span className="relative">{leading}</span>
      {entity.type !== "note" && entity.type !== "jot" && (
        <span className="relative hidden w-20 shrink-0 sm:flex">
          <EntityKeyCopyInline entityKey={entity.key} className="-ml-1" />
        </span>
      )}
      <span
        className={cn(
          "pointer-events-none relative min-w-0 flex-1 truncate text-sm",
          struck && "text-muted-foreground line-through",
        )}
      >
        {title}
      </span>
      <span className="relative flex shrink-0 items-center">{trailing}</span>
      {link && onUnlinked && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={unlink.isError ? "Couldn't remove link, try again" : "Remove Link"}
              onClick={() => !unlink.isPending && unlink.mutate()}
              className={cn(
                "relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100",
                (unlink.isPending || unlink.isError) && "opacity-100",
              )}
            >
              <PendingIcon
                pending={unlink.isPending}
                failed={unlink.isError}
                idle={<IconUnlink size={14} />}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>Remove Link</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

const MAX_SUGGESTIONS = 5;

/// Existing items similar to `query`: an ID match (`TSK-14`, `tsk14`), or a title
/// holding every typed word in any order. ID matches first, then titles starting
/// with the query.
function suggest(candidates: Entity[], query: string): Entity[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const words = needle.split(/\s+/);
  const scored = candidates.flatMap((entity) => {
    const title = displayTitle(entity).toLowerCase();
    if (matchesKey(entity.key, query)) return [{ entity, score: 0 }];
    if (!words.every((w) => title.includes(w))) return [];
    return [{ entity, score: title.startsWith(needle) ? 1 : 2 }];
  });
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => s.entity);
}

/// Types an item in place, like adding sub-tasks. Matching existing items are
/// suggested below as you type: arrow keys pick one and Enter links it, otherwise
/// Enter creates a new one already linked. Stays open for the next one; Escape
/// stops.
function RelatedAddInput({
  owner,
  noun,
  candidates,
  leadingFor,
  create,
  onLinked,
  onDone,
}: {
  owner: Entity;
  /// Lowercase, like "task".
  noun: string;
  /// Items not linked yet, the pool suggestions come from.
  candidates: Entity[];
  /// A suggestion's leading glyph, like a task's status.
  leadingFor: (entity: Entity) => ReactNode;
  /// Creates a new item titled `title` and returns its id.
  create: (title: string) => Promise<string>;
  onLinked: (otherId: string) => Promise<void[]>;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = suggest(candidates, title);
  // Row 0 creates a new item; rows after it link a suggestion.
  const rowCount = title.trim() ? suggestions.length + 1 : 0;
  const listId = `related-${noun}-suggestions`;
  const optionId = (index: number) => `related-${noun}-option-${index}`;

  const add = useMutation({
    mutationFn: async (choice: { create: string } | { link: Entity }) => {
      const id = "link" in choice ? choice.link.id : await create(choice.create);
      await createRelationship(owner.id, id, "relates-to");
      await onLinked(id);
    },
    onSuccess: () => {
      setTitle("");
      setActive(0);
    },
  });

  useEffect(() => inputRef.current?.focus(), []);

  function choose(index: number) {
    if (add.isPending || !title.trim()) return;
    const suggestion = suggestions[index - 1];
    add.mutate(suggestion ? { link: suggestion } : { create: title.trim() });
  }

  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2 pl-1">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center">
          <PendingIcon
            pending={add.isPending}
            failed={add.isError}
            idle={<IconCircleDashed size={14} className="text-muted-foreground/60" />}
          />
        </span>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onDone();
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (rowCount > 0) {
                setActive((i) => (i + (e.key === "ArrowDown" ? 1 : rowCount - 1)) % rowCount);
              }
            }
            if (e.key === "Enter") {
              e.preventDefault();
              choose(active);
            }
          }}
          onBlur={() => !title.trim() && !add.isError && onDone()}
          placeholder={`${noun === "task" ? "Task" : "Note"} title or ID, Enter to add, Esc to stop`}
          role="combobox"
          aria-expanded={rowCount > 0}
          aria-controls={listId}
          aria-activedescendant={rowCount > 0 ? optionId(active) : undefined}
          aria-label={`New or existing ${noun}`}
          aria-invalid={add.isError || undefined}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      {rowCount > 0 && (
        <div
          id={listId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a combobox popup with rich rows, which a native <datalist> can't render
          role="listbox"
          aria-label={`Create or link a ${noun}`}
          className="ml-8 flex flex-col gap-0.5"
        >
          <SuggestionRow
            id={optionId(0)}
            active={active === 0}
            onHover={() => setActive(0)}
            onPick={() => choose(0)}
          >
            <IconPlus size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate">
              Create <span className="font-medium">&ldquo;{title.trim()}&rdquo;</span>
            </span>
          </SuggestionRow>
          {suggestions.map((entity, i) => (
            <SuggestionRow
              key={entity.id}
              id={optionId(i + 1)}
              active={active === i + 1}
              onHover={() => setActive(i + 1)}
              onPick={() => choose(i + 1)}
            >
              <IconLink size={14} className="shrink-0 text-muted-foreground" />
              {leadingFor(entity)}
              <EntityKey entityKey={entity.key} />
              <span className="min-w-0 flex-1 truncate">{displayTitle(entity)}</span>
            </SuggestionRow>
          ))}
        </div>
      )}
      <div className="pl-8">
        <FieldError message={add.isError && `Couldn't add the ${noun}, press Enter to retry`} />
      </div>
    </div>
  );
}

function SuggestionRow({
  id,
  active,
  onHover,
  onPick,
  children,
}: {
  id: string;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a rich combobox row, see the listbox above
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        // Keeps focus in the input, so typing continues after a click.
        e.preventDefault();
        onPick();
      }}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm",
        active && "bg-accent",
      )}
    >
      {children}
    </div>
  );
}

function NoteGlyph({ note }: { note: Entity }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center">
      <EntityIcon entity={note} className="text-muted-foreground" />
    </span>
  );
}
