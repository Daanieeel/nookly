import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import { FieldError, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Kbd } from "#/components/kbd.tsx";
import { createCard, updateCard } from "#/lib/api/decks.ts";
import type { CardBlock, IndexCard } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";
import { EMPTY_FACE, faceBlocks, isFaceEmpty, sameFace, type Side } from "./card-blocks";
import { CardFaceEditor } from "./CardFaceEditor";
import { invalidateDeck } from "./deck-data";
import { CardSurface, DeckStack, FlipCard } from "./index-card";

interface Draft {
  front: CardBlock[];
  back: CardBlock[];
}

/// Half written new cards, per deck, so leaving the writer never loses one.
const drafts = new Map<string, Draft>();

/// Writing cards like on paper: write the front, flip it over, write the back, and
/// it drops onto the deck while a blank card slides in. Each side is a small block editor,
/// the one notes use. With `editing`, the same card turns back into the one being changed
/// and leaving saves it.
export function CardWriter({
  deckId,
  spaceId,
  count,
  editing = null,
  onDone,
}: {
  deckId: string;
  spaceId: string;
  count: number;
  editing?: IndexCard | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  // What the card held when it was opened, so leaving without a change saves nothing.
  const [original] = useState<Draft | null>(() =>
    editing ? { front: faceBlocks(editing, "front"), back: faceBlocks(editing, "back") } : null,
  );
  const [draft, setDraftState] = useState<Draft>(
    () => original ?? drafts.get(deckId) ?? { front: EMPTY_FACE, back: EMPTY_FACE },
  );
  const [side, setSide] = useState<Side>("front");
  const [draftKey, setDraftKey] = useState(0);

  // Read by the keys too, which can fire before a render has caught up with the last letter.
  const draftRef = useRef(draft);
  const setDraft = (patch: Partial<Draft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraftState(next);
    if (!editing) drafts.set(deckId, next);
  };

  const save = useMutation({
    mutationFn: () => {
      const faces = {
        frontBlocks: draftRef.current.front,
        backBlocks: draftRef.current.back,
      };
      return editing ? updateCard(editing.id, faces) : createCard(deckId, faces);
    },
    onSuccess: async () => {
      await invalidateDeck(queryClient, deckId);
      if (editing) return onDone();
      drafts.delete(deckId);
      draftRef.current = { front: EMPTY_FACE, back: EMPTY_FACE };
      setDraftState(draftRef.current);
      setSide("front");
      setDraftKey((k) => k + 1);
    },
  });
  const status = statusOf(save);

  const submit = () => {
    if (save.isPending) return;
    const { front, back } = draftRef.current;
    if (isFaceEmpty(front)) return setSide("front");
    if (isFaceEmpty(back)) return setSide("back");
    save.mutate();
  };

  const leave = () => {
    const { front, back } = draftRef.current;
    const changed =
      original &&
      (!sameFace(front, original.front) || !sameFace(back, original.back)) &&
      !isFaceEmpty(front) &&
      !isFaceEmpty(back);
    if (changed) save.mutate();
    else onDone();
  };

  const flip = () => setSide((s) => (s === "front" ? "back" : "front"));
  const keys = { flip, submit, leave };

  const submitLabel = editing ? "Save card" : "Add to deck";
  const corner = (
    <span className="flex items-center gap-1">{side === "front" ? "1" : "2"} of 2</span>
  );

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{editing ? "Editing card" : "New card"}</span>
          <span className="text-xs text-muted-foreground">
            Type “/” for pictures, formulas and more
          </span>
        </div>
        {!editing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{count === 1 ? "1 card in deck" : `${count} cards in deck`}</span>
            <DeckStack count={count} size="sm" />
          </div>
        )}
      </div>

      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={draftKey}
            initial={reduceMotion ? { opacity: 0 } : { y: 32, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, x: 0, opacity: 1, scale: 1, rotate: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.1 } }
                : {
                    x: "40%",
                    y: "-64%",
                    scale: 0.12,
                    rotate: 8,
                    opacity: 0,
                    transition: { duration: 0.42, ease: [0.4, 0, 0.2, 1] },
                  }
            }
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="pointer-events-auto"
          >
            <FlipCard
              flipped={side === "back"}
              front={
                <CardSurface side="front" label="Front" corner={corner} invalid={save.isError}>
                  <FaceBody side="front">
                    <CardFaceEditor
                      key={`${draftKey}-front`}
                      spaceId={spaceId}
                      side="front"
                      initial={draft.front}
                      active={side === "front"}
                      keys={keys}
                      onChange={(front) => setDraft({ front })}
                    />
                  </FaceBody>
                </CardSurface>
              }
              back={
                <CardSurface side="back" label="Back" corner={corner} invalid={save.isError}>
                  <FaceBody side="back">
                    <CardFaceEditor
                      key={`${draftKey}-back`}
                      spaceId={spaceId}
                      side="back"
                      initial={draft.back}
                      active={side === "back"}
                      keys={keys}
                      onChange={(back) => setDraft({ back })}
                    />
                  </FaceBody>
                </CardSurface>
              }
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1">
        <HintButton keys="Tab" onClick={flip}>
          Flip
        </HintButton>
        <span className="flex h-8 items-center gap-1.5 px-3 text-xs text-muted-foreground">
          <Kbd>Enter</Kbd>
          New line
        </span>
        <HintButton
          keys="⌘ Enter"
          onClick={submit}
          icon={<StatusIcon status={status} idle={null} size={13} />}
        >
          {submitLabel}
        </HintButton>
        <HintButton keys="Esc" onClick={leave}>
          Done
        </HintButton>
      </div>
      <div className="flex justify-center">
        <FieldError
          message={
            save.isError &&
            (editing
              ? "Couldn't save the card, press Cmd Enter to try again"
              : "Couldn't add the card, press Cmd Enter to try again")
          }
        />
      </div>
    </div>
  );
}

/// The room one side's editor has on the card: it scrolls when the content outgrows the card.
function FaceBody({ side, children }: { side: Side; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 overflow-y-auto px-6",
        side === "front" ? "items-center pb-7" : "pt-7 pb-2",
      )}
    >
      {children}
    </div>
  );
}

function HintButton({
  keys,
  icon = null,
  children,
  className,
  ...props
}: {
  keys: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      className={cn("gap-1.5", className)}
      {...props}
    >
      <Kbd>{keys}</Kbd>
      {icon}
      {children}
    </Button>
  );
}
