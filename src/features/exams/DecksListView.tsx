import { IconCalendarStats, IconCards, IconPlayerPlayFilled, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FieldError, StatusIcon, statusOf } from "@/components/action-feedback";
import { contextTarget, entityTarget } from "@/components/context-menu/registry";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCreateShortcut } from "@/hooks/use-create-shortcut";
import { createDeck, listDeckSummaries } from "@/lib/api/decks";
import { listExams } from "@/lib/api/exams";
import type { DeckSummary, Exam } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { deckKeys, formatInterval, requestStudy, studyCount } from "./deck/deck-data";
import { DeckStack, STATE_TONE } from "./deck/index-card";

/// Every deck as a pile on the desk. Decks with cards to study come first, the
/// ones prepping for the nearest exam leading; caught up decks follow by name.
export function DecksListView({ spaceId }: { spaceId: string }) {
  const [creating, setCreating] = useState(false);
  const { data: decks = [], isPending } = useQuery({
    queryKey: deckKeys.summaries(spaceId),
    queryFn: () => listDeckSummaries(spaceId),
  });
  const { data: exams = [] } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });
  const examOf = new Map(exams.map((e) => [e.entity.id, e]));

  const startCreate = useCallback(() => setCreating(true), []);
  useCreateShortcut(startCreate);

  const examDate = (deck: DeckSummary) =>
    (deck.examId && examOf.get(deck.examId)?.examDate) || "9999-12-31";
  const ready = decks
    .filter((d) => studyCount(d.stats) > 0)
    .sort(
      (a, b) => examDate(a).localeCompare(examDate(b)) || studyCount(b.stats) - studyCount(a.stats),
    );
  const caughtUp = decks
    .filter((d) => studyCount(d.stats) === 0)
    .sort((a, b) => displayTitle(a.entity).localeCompare(displayTitle(b.entity)));

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      {...contextTarget("module-view", { spaceId, createLabel: "New Deck", create: startCreate })}
    >
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border py-2 pr-2 pl-4">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <IconCards size={16} className="text-muted-foreground" />
          Decks
        </h1>
        <div className="flex flex-1 justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={startCreate}>
                <IconPlus />
                New deck
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Create a deck <Kbd>C</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-8 p-6">
          {!isPending && decks.length === 0 && !creating ? (
            <EmptyState
              icon={IconCards}
              title="No decks yet"
              description="Press C to add one. Name it, then start writing cards."
              action={{ label: "New deck", onClick: startCreate }}
            />
          ) : (
            <>
              <DeckSection label="Ready to study" decks={ready} examOf={examOf}>
                {creating && <NewDeckTile spaceId={spaceId} onDone={() => setCreating(false)} />}
              </DeckSection>
              <DeckSection label="All caught up" decks={caughtUp} examOf={examOf} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DeckSection({
  label,
  decks,
  examOf,
  children,
}: {
  label: string;
  decks: DeckSummary[];
  examOf: Map<string, Exam>;
  children?: React.ReactNode;
}) {
  if (decks.length === 0 && !children) return null;
  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-2 text-xs font-medium text-muted-foreground">
        {label}
        <span className="font-normal tabular-nums">{decks.length}</span>
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
        {children}
        {decks.map((deck) => (
          <DeckTile
            key={deck.entity.id}
            deck={deck}
            exam={deck.examId ? examOf.get(deck.examId) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function DeckTile({ deck, exam }: { deck: DeckSummary; exam: Exam | undefined }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const { entity, stats } = deck;
  const toStudy = studyCount(stats);
  const open = () => openEntity(entity.id, entity.spaceId);
  const counts = [
    { group: "new", value: stats.new, label: "new" },
    { group: "learning", value: stats.learning, label: "learning" },
    { group: "review", value: stats.due, label: "due" },
  ] as const;

  return (
    <div className="group relative" {...entityTarget(entity)}>
      <button
        type="button"
        onClick={open}
        aria-label={`Open ${displayTitle(entity)}`}
        className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-3">
          <DeckStack count={stats.total} size="sm" className="mt-1" />
          {toStudy === 0 && (
            <span className="text-xs text-muted-foreground">
              {stats.nextDueAt ? `next in ${formatInterval(stats.nextDueAt)}` : "No cards due"}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-medium">{displayTitle(entity)}</span>
          {exam && <ExamLine exam={exam} />}
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          {counts.map((c) => (
            <span
              key={c.group}
              className={cn(
                "flex items-center gap-1",
                c.value > 0 ? STATE_TONE[c.group] : "text-muted-foreground/60",
              )}
            >
              <span className="font-medium">{c.value}</span>
              <span className="text-muted-foreground">{c.label}</span>
            </span>
          ))}
        </div>
      </button>
      {toStudy > 0 && (
        <span className="absolute top-3 right-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                aria-label={`Study ${toStudy} cards of ${displayTitle(entity)}`}
                onClick={() => {
                  requestStudy(entity.id);
                  open();
                }}
              >
                <IconPlayerPlayFilled />
                {toStudy}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Study Now</TooltipContent>
          </Tooltip>
        </span>
      )}
    </div>
  );
}

/// The Exam a deck prepares for, with how close it is.
function ExamLine({ exam }: { exam: Exam }) {
  const days = exam.examDate ? differenceInCalendarDays(parseISO(exam.examDate), new Date()) : null;
  const when =
    days === null || days < 0
      ? null
      : days === 0
        ? "today"
        : days === 1
          ? "tomorrow"
          : `in ${days} days`;
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <IconCalendarStats size={12} className="shrink-0" />
      <span className="truncate">{displayTitle(exam.entity)}</span>
      {when && (
        <span className={cn("shrink-0", days !== null && days <= 7 && "text-caution")}>{when}</span>
      )}
    </span>
  );
}

/// A blank deck in the grid, named in place. Enter creates it and opens it onto
/// the writing desk; Escape puts it away.
function NewDeckTile({ spaceId, onDone }: { spaceId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const reduceMotion = useReducedMotion();
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const create = useMutation({
    mutationFn: () => createDeck(spaceId, title.trim(), null),
    onSuccess: async (deck) => {
      await queryClient.invalidateQueries({ queryKey: deckKeys.summaries(spaceId) });
      onDone();
      openEntity(deck.id, spaceId);
    },
  });

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-dashed bg-card p-4",
        create.isError ? "border-destructive" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <DeckStack count={0} size="sm" className="mt-1" />
        <StatusIcon status={statusOf(create)} idle={null} />
      </div>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
          if (e.key === "Enter" && title.trim() && !create.isPending) {
            e.preventDefault();
            create.mutate();
          }
        }}
        onBlur={() => !title.trim() && onDone()}
        placeholder="Deck name"
        aria-label="New deck name"
        aria-invalid={create.isError || undefined}
        className="min-w-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/60"
      />
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Kbd>Enter</Kbd> to create, then write its cards
      </span>
      <FieldError message={create.isError && "Couldn't create the deck, press Enter to retry"} />
    </motion.div>
  );
}
