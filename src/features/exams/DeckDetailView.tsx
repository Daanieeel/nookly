import {
  IconArrowUpRight,
  IconCalendarStats,
  IconCards,
  IconPencilPlus,
  IconPlayerPlayFilled,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusIcon, statusOf } from "@/components/action-feedback";
import { EmptyState } from "@/components/empty-state";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { EntityPickerPopover } from "@/components/entity-picker";
import { PROPERTY_VALUE, PropertyRow } from "@/components/property-row";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  deleteCard,
  getDeckStats,
  listCards,
  listDeckSummaries,
  restoreCard,
  setDeckExam,
} from "@/lib/api/decks";
import { listExams } from "@/lib/api/exams";
import { displayTitle } from "@/lib/entity-title";
import { formatTimestamp } from "@/features/tasks/task-model";
import { useNavStore } from "@/lib/store/nav";
import type { DeckStats, Entity, IndexCard } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { CardText } from "./deck/card-text";
import { CardWriter } from "./deck/CardWriter";
import {
  deckKeys,
  formatInterval,
  invalidateDeck,
  isDue,
  isTypingTarget,
  studyCount,
  takeStudyRequest,
} from "./deck/deck-data";
import { DeckStack, STATE_TONE, stateGroup } from "./deck/index-card";
import { StudySession } from "./deck/StudySession";

type Mode = { kind: "overview" } | { kind: "write"; editing: IndexCard | null } | { kind: "study" };

/// A deck of index cards with three surfaces: the pile with what's due and every
/// card laid out, the writing desk, and a study session.
export function DeckDetailView({ entity }: { entity: Entity }) {
  const { data: cards = [], isFetched } = useQuery({
    queryKey: deckKeys.cards(entity.id),
    queryFn: () => listCards(entity.id),
  });
  const { data: stats } = useQuery({
    queryKey: deckKeys.stats(entity.id),
    queryFn: () => getDeckStats(entity.id),
  });
  const [mode, setMode] = useState<Mode>({ kind: "overview" });
  // An empty deck opens straight onto the desk, once.
  const openedEmpty = useRef(false);
  useEffect(() => {
    if (isFetched && cards.length === 0 && !openedEmpty.current && !entity.deletedAt) {
      openedEmpty.current = true;
      setMode({ kind: "write", editing: null });
    }
  }, [isFetched, cards.length, entity.deletedAt]);
  // The Decks page's Study button lands here with a session already open.
  useEffect(() => {
    if (takeStudyRequest(entity.id)) setMode({ kind: "study" });
  }, [entity.id]);

  const toStudy = stats ? studyCount(stats) : 0;
  const overview = () => setMode({ kind: "overview" });

  useEffect(() => {
    if (mode.kind !== "overview") return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n") {
        e.preventDefault();
        setMode({ kind: "write", editing: null });
      } else if (e.key === "s" && toStudy > 0) {
        e.preventDefault();
        setMode({ kind: "study" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode.kind, toStudy]);

  return (
    <EntityDetailLayout entity={entity} sidebar={<DeckProperties entity={entity} stats={stats} />}>
      {mode.kind === "write" ? (
        <div className="py-6">
          <CardWriter
            key={mode.editing?.id ?? "new"}
            deckId={entity.id}
            count={cards.length}
            editing={mode.editing}
            onDone={overview}
          />
        </div>
      ) : mode.kind === "study" ? (
        <div className="py-2">
          <StudySession deckId={entity.id} onExit={overview} />
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <DeckHero
            count={cards.length}
            stats={stats}
            toStudy={toStudy}
            onStudy={() => setMode({ kind: "study" })}
            onWrite={() => setMode({ kind: "write", editing: null })}
          />
          <section className="flex flex-col gap-3">
            <h3 className="flex items-baseline gap-2 text-sm font-medium">
              Cards
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {cards.length}
              </span>
            </h3>
            {cards.length === 0 ? (
              isFetched && (
                <EmptyState
                  icon={IconCards}
                  title="No cards yet"
                  description="Write a front and a back, and the card joins the deck."
                  action={{
                    label: "Write the first card",
                    onClick: () => setMode({ kind: "write", editing: null }),
                  }}
                />
              )
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                {cards.map((card) => (
                  <MiniCard
                    key={card.id}
                    card={card}
                    onOpen={() => setMode({ kind: "write", editing: card })}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </EntityDetailLayout>
  );
}

function DeckHero({
  count,
  stats,
  toStudy,
  onStudy,
  onWrite,
}: {
  count: number;
  stats: DeckStats | undefined;
  toStudy: number;
  onStudy: () => void;
  onWrite: () => void;
}) {
  const figures = [
    { group: "new", label: "New", value: stats?.new ?? 0 },
    { group: "learning", label: "Learning", value: stats?.learning ?? 0 },
    { group: "review", label: "Due", value: stats?.due ?? 0 },
  ] as const;
  const footnote =
    toStudy === 0 && stats?.nextDueAt
      ? `Nothing due. The next card comes back in ${formatInterval(stats.nextDueAt)}.`
      : stats && stats.reviewedToday > 0
        ? `${stats.reviewedToday} rated today`
        : null;

  return (
    <section className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-2">
      <DeckStack count={count} className="ml-1" />
      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-6">
          {figures.map((f) => (
            <div key={f.group} className="flex flex-col">
              <span
                className={cn(
                  "font-heading text-2xl leading-none font-semibold tabular-nums",
                  f.value > 0 ? STATE_TONE[f.group] : "text-muted-foreground/50",
                )}
              >
                {f.value}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">{f.label}</span>
            </div>
          ))}
        </div>
        {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="secondary" onClick={onWrite}>
          <IconPencilPlus />
          Write cards
          <Kbd>N</Kbd>
        </Button>
        <Button onClick={onStudy} disabled={toStudy === 0}>
          <IconPlayerPlayFilled />
          {toStudy === 0 ? "Nothing to study" : `Study ${toStudy}`}
        </Button>
      </div>
    </section>
  );
}

/// One card of the laid out deck, front up, with where it stands in learning.
function MiniCard({ card, onOpen }: { card: IndexCard; onOpen: () => void }) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const remove = useMutation({
    mutationFn: () => deleteCard(card.id),
    onSuccess: async () => {
      await invalidateDeck(queryClient, card.deckEntityId);
      // The card is gone from the grid, so nothing is left on screen to confirm it.
      toast.success("Card deleted", {
        action: {
          label: "Undo",
          onClick: () =>
            void restoreCard(card.id).then(() => invalidateDeck(queryClient, card.deckEntityId)),
        },
      });
    },
  });
  const group = stateGroup(card.state);
  const due =
    card.state === "new"
      ? "New"
      : isDue(card.dueAt)
        ? "Due now"
        : `in ${formatInterval(card.dueAt)}`;

  return (
    <motion.div
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group relative"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Edit card: ${card.front}`}
        className="index-card-mini flex aspect-5/3 w-full flex-col rounded-md border border-border bg-card p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="line-clamp-3 min-h-0 flex-1 text-sm">
          <CardText text={card.front} />
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          <span className={cn("size-1.5 rounded-full bg-current", STATE_TONE[group])} />
          {due}
        </span>
      </button>
      <span
        className={cn(
          "absolute top-1 right-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
          remove.isError && "opacity-100",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={remove.isError ? "destructive" : "ghost"}
              size="iconSm"
              onClick={() => !remove.isPending && remove.mutate()}
              aria-label={remove.isError ? "Couldn't delete, try again" : "Delete Card"}
              className="size-6 [&_svg]:size-3.5"
            >
              <StatusIcon status={statusOf(remove)} idle={<IconTrash />} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {remove.isError ? "Couldn't delete, try again" : "Delete Card"}
          </TooltipContent>
        </Tooltip>
      </span>
    </motion.div>
  );
}

/// The deck's properties: the Exam it prepares for, which it can do without,
/// and where its cards stand.
function DeckProperties({ entity, stats }: { entity: Entity; stats: DeckStats | undefined }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const { spaceId } = entity;
  const { data: summaries = [] } = useQuery({
    queryKey: deckKeys.summaries(spaceId),
    queryFn: () => listDeckSummaries(spaceId),
  });
  const { data: exams = [] } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });
  const examId = summaries.find((s) => s.entity.id === entity.id)?.examId ?? null;
  const exam = exams.find((e) => e.entity.id === examId);

  const setExam = useMutation({
    mutationFn: (next: string | null) => setDeckExam(entity.id, next),
    onSuccess: (_, next) =>
      Promise.all(
        [
          deckKeys.summaries(spaceId),
          ["relationships", entity.id],
          ["relationships", examId],
          ["relationships", next],
        ]
          .filter(([, id]) => id)
          .map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
  const examStatus = statusOf(setExam) === "success" ? "idle" : statusOf(setExam);

  return (
    <section aria-label="Properties" className="flex flex-col gap-0.5">
      <PropertyRow label="Exam">
        <div className="group/exam flex items-center gap-0.5">
          <EntityPickerPopover
            spaceId={spaceId}
            typeFilter="exam"
            exclude={examId ?? undefined}
            onSelect={(next) => setExam.mutate(next.id)}
            trigger={
              <button
                type="button"
                aria-label={setExam.isError ? "Couldn't change the exam, try again" : "Change Exam"}
                className={PROPERTY_VALUE}
              >
                <StatusIcon
                  status={examStatus}
                  idle={<IconCalendarStats size={14} className="shrink-0 text-muted-foreground" />}
                />
                {exam ? (
                  <span className="truncate">{displayTitle(exam.entity)}</span>
                ) : (
                  <span className="text-muted-foreground">No exam</span>
                )}
              </button>
            }
          />
          {exam && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Open Exam ${displayTitle(exam.entity)}`}
                    onClick={() => openEntity(exam.entity.id, spaceId)}
                    className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/exam:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                  >
                    <IconArrowUpRight size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Open Exam</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Remove Exam"
                    onClick={() => !setExam.isPending && setExam.mutate(null)}
                    className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/exam:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                  >
                    <IconX size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Remove Exam</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </PropertyRow>

      <PropertyRow label="Cards">
        <span className="flex h-7 items-center px-2 text-sm tabular-nums">
          {stats ? stats.total : "…"}
        </span>
      </PropertyRow>
      <PropertyRow label="Rated today">
        <span className="flex h-7 items-center px-2 text-sm tabular-nums">
          {stats ? stats.reviewedToday : "…"}
        </span>
      </PropertyRow>
      <PropertyRow label="Next due">
        <span className="flex h-7 items-center px-2 text-sm text-muted-foreground tabular-nums">
          {stats && studyCount(stats) > 0
            ? "Now"
            : stats?.nextDueAt
              ? `in ${formatInterval(stats.nextDueAt)}`
              : "Nothing scheduled"}
        </span>
      </PropertyRow>
      <PropertyRow label="Created">
        <span className="flex h-7 items-center px-2 text-sm text-muted-foreground">
          {formatTimestamp(entity.createdAt)}
        </span>
      </PropertyRow>
    </section>
  );
}
