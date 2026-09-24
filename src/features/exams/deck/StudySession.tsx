import { IconArrowBackUp, IconArrowLeft, IconConfetti } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  FieldError,
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  type ActionStatus,
} from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getDeckStats, getStudyQueue, reviewCard, undoReview } from "@/lib/api/decks";
import type { CardRating, IndexCard } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { CardText, faceTextSize } from "./card-text";
import { deckKeys, formatInterval, invalidateDeck, isTypingTarget } from "./deck-data";
import { CardSurface, FlipCard, STATE_TONE, stateGroup } from "./index-card";

const RATINGS: {
  rating: CardRating;
  label: string;
  key: string;
  variant: "destructive" | "caution" | "positive" | "secondary";
}[] = [
  { rating: "again", label: "Again", key: "1", variant: "destructive" },
  { rating: "hard", label: "Hard", key: "2", variant: "caution" },
  { rating: "good", label: "Good", key: "3", variant: "positive" },
  { rating: "easy", label: "Easy", key: "4", variant: "secondary" },
];

/// Studying a deck like with paper cards: read the front, turn it over, say how
/// well you knew it. FSRS picks when it comes back. Space turns the card and then
/// counts as Good, 1 to 4 rate, Z undoes the last rating, Esc leaves.
export function StudySession({ deckId, onExit }: { deckId: string; onExit: () => void }) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const { data: queue = [], isFetched } = useQuery({
    queryKey: deckKeys.queue(deckId),
    queryFn: () => getStudyQueue(deckId),
  });
  const { data: stats } = useQuery({
    queryKey: deckKeys.stats(deckId),
    queryFn: () => getDeckStats(deckId),
  });
  const [flipped, setFlipped] = useState(false);
  // A card just brought back by undo shows next, wherever the queue sorts it.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [lastRating, setLastRating] = useState<CardRating | null>(null);
  const [presentation, setPresentation] = useState(0);

  const current = queue.find((c) => c.id === pinnedId) ?? queue[0];

  const review = useMutation({
    mutationFn: (vars: { card: IndexCard; rating: CardRating }) =>
      reviewCard(vars.card.id, vars.rating),
    onSuccess: async (_, { card, rating }) => {
      // Take the card off the pile right away, the refetch then settles where it goes.
      queryClient.setQueryData<IndexCard[]>(deckKeys.queue(deckId), (old) =>
        old?.filter((c) => c.id !== card.id),
      );
      setLastRating(rating);
      setHistory((h) => [...h, card.id]);
      setPinnedId(null);
      setFlipped(false);
      setPresentation((p) => p + 1);
      await invalidateDeck(queryClient, deckId);
    },
  });
  const undo = useMutation({
    mutationFn: (cardId: string) => undoReview(cardId),
    onSuccess: async (card) => {
      setHistory((h) => h.slice(0, -1));
      setLastRating(null);
      setPinnedId(card.id);
      setFlipped(false);
      setPresentation((p) => p + 1);
      await invalidateDeck(queryClient, deckId);
    },
  });

  const rate = (rating: CardRating) => {
    if (!current || !flipped || review.isPending) return;
    review.mutate({ card: current, rating });
  };
  const undoLast = () => {
    const last = history.at(-1);
    if (last && !undo.isPending) undo.mutate(last);
  };

  const keys = useRef({ rate, undoLast, flipped, onExit, hasCard: !!current });
  keys.current = { rate, undoLast, flipped, onExit, hasCard: !!current };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.altKey) return;
      const k = keys.current;
      if (e.key === "Escape") {
        e.preventDefault();
        k.onExit();
      } else if ((e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        k.undoLast();
      } else if (e.metaKey || e.ctrlKey) {
        return;
      } else if (!k.hasCard) {
        return;
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (k.flipped) k.rate("good");
        else setFlipped(true);
      } else if (k.flipped && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        k.rate(RATINGS[Number(e.key) - 1].rating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = { new: 0, learning: 0, review: 0 };
  for (const card of queue) counts[stateGroup(card.state)] += 1;
  const reviewed = history.length;
  const progress = reviewed + queue.length === 0 ? 1 : reviewed / (reviewed + queue.length);
  const ratingStatus = (rating: CardRating): ActionStatus =>
    review.variables?.rating === rating ? statusOf(review) : "idle";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onExit}>
          <IconArrowLeft />
          Back to deck
          <Kbd>Esc</Kbd>
        </Button>
        {current && (
          <div className="flex items-center gap-3 text-sm tabular-nums" aria-label="Cards left">
            {(["new", "learning", "review"] as const).map((group) => (
              <span
                key={group}
                className={cn(
                  "flex items-center gap-1 border-b-2 border-transparent pb-0.5",
                  STATE_TONE[group],
                  stateGroup(current.state) === group && "border-current",
                )}
              >
                <span className="font-medium">{counts[group]}</span>
                <span className="text-xs text-muted-foreground capitalize">{group}</span>
              </span>
            ))}
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={undo.isError ? "destructive" : "ghost"}
              size="iconSm"
              disabled={history.length === 0}
              onClick={undoLast}
              aria-label={undo.isError ? "Couldn't undo, try again" : "Undo Last Rating"}
            >
              <StatusIcon
                status={statusOf(undo) === "success" ? "idle" : statusOf(undo)}
                idle={<IconArrowBackUp />}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {undo.isError ? "Couldn't undo, try again" : "Undo Last Rating"} <Kbd>Z</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="h-0.5 overflow-hidden rounded-full bg-accent" aria-hidden>
        <motion.div
          className="h-full bg-positive"
          initial={false}
          animate={{ width: `${progress * 100}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 30 }}
        />
      </div>

      {current ? (
        <>
          <div className="relative">
            <AnimatePresence mode="popLayout" initial={false} custom={lastRating}>
              <motion.div
                key={`${current.id}:${presentation}`}
                custom={lastRating}
                variants={{
                  enter: { y: reduceMotion ? 0 : 20, opacity: 0, scale: reduceMotion ? 1 : 0.98 },
                  shown: { y: 0, x: 0, opacity: 1, scale: 1, rotate: 0 },
                  gone: (rating: CardRating | null) =>
                    reduceMotion || !rating
                      ? { opacity: 0, transition: { duration: 0.12 } }
                      : rating === "again"
                        ? { y: 36, scale: 0.94, opacity: 0, transition: { duration: 0.28 } }
                        : { x: "70%", rotate: 7, opacity: 0, transition: { duration: 0.32 } },
                }}
                initial="enter"
                animate="shown"
                exit="gone"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <button
                  type="button"
                  className="block w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => !flipped && setFlipped(true)}
                  aria-label={flipped ? "Answer shown" : "Show answer"}
                >
                  <FlipCard
                    flipped={flipped}
                    front={
                      <CardSurface
                        side="front"
                        label={
                          <span className={STATE_TONE[stateGroup(current.state)]}>
                            {current.state}
                          </span>
                        }
                        corner={current.lapses > 0 ? `forgotten ${current.lapses}×` : null}
                      >
                        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8 pb-7 text-center">
                          <CardText
                            text={current.front}
                            className={cn("font-medium", faceTextSize(current.front))}
                          />
                        </div>
                      </CardSurface>
                    }
                    back={
                      <CardSurface side="back" label="Answer">
                        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-7 pb-2">
                          <CardText
                            text={current.front}
                            className="text-sm/7 text-muted-foreground"
                          />
                          <CardText text={current.back} className="text-base/7" />
                        </div>
                      </CardSurface>
                    }
                  />
                </button>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="grid h-14 grid-cols-4 gap-2">
            {flipped ? (
              RATINGS.map(({ rating, label, key, variant }) => (
                <Button
                  key={rating}
                  variant={variant}
                  onClick={() => rate(rating)}
                  className="h-full flex-col gap-0.5"
                >
                  <span className="flex items-center gap-1.5">
                    <StatusIcon status={ratingStatus(rating)} idle={null} size={13} />
                    {label}
                    <Kbd>{key}</Kbd>
                  </span>
                  <span className="text-xs font-normal opacity-80 tabular-nums">
                    {formatInterval(current.next[rating])}
                  </span>
                </Button>
              ))
            ) : (
              <Button
                variant="secondary"
                className="col-span-4 h-full"
                onClick={() => setFlipped(true)}
              >
                Show answer
                <Kbd>Space</Kbd>
              </Button>
            )}
          </div>
          <div className="flex justify-center">
            <FieldError message={review.isError && "Couldn't save the rating, try again"} />
          </div>
          <StatusAnnouncer message={flipped ? `Answer: ${current.back}` : null} />
        </>
      ) : (
        isFetched && (
          <SessionDone
            reviewed={reviewed}
            reviewedToday={stats?.reviewedToday ?? reviewed}
            nextDueAt={stats?.nextDueAt ?? null}
            onExit={onExit}
          />
        )
      )}
    </div>
  );
}

function SessionDone({
  reviewed,
  reviewedToday,
  nextDueAt,
  onExit,
}: {
  reviewed: number;
  reviewedToday: number;
  nextDueAt: string | null;
  onExit: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-positive/10 text-positive">
        <IconConfetti size={20} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-heading text-base font-medium">All caught up</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {reviewed > 0
            ? `You rated ${reviewed} ${reviewed === 1 ? "card" : "cards"} in this session, ${reviewedToday} today.`
            : "Nothing is due in this deck right now."}{" "}
          {nextDueAt
            ? `The next card comes back in ${formatInterval(nextDueAt)}.`
            : "Write more cards to keep going."}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onExit}>
        <IconArrowLeft />
        Back to deck
      </Button>
    </motion.div>
  );
}
