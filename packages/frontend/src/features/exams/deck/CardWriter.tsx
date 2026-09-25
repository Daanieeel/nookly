import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FieldError, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Kbd } from "@nookly/ui/components/kbd";
import { createCard, updateCard } from "#/lib/api/decks.ts";
import type { IndexCard } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";
import { faceTextSize } from "./card-text";
import { invalidateDeck } from "./deck-data";
import { CardSurface, DeckStack, FlipCard } from "./index-card";

type Side = "front" | "back";
interface Draft {
  front: string;
  back: string;
}

/// Half written new cards, per deck, so leaving the writer never loses one.
const drafts = new Map<string, Draft>();

/// Writing cards like on paper: type the front, flip it over, type the back, and
/// it drops onto the deck while a blank card slides in. With `editing`, the same
/// card turns back into the one being changed and leaving saves it.
export function CardWriter({
  deckId,
  count,
  editing = null,
  onDone,
}: {
  deckId: string;
  count: number;
  editing?: IndexCard | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [draft, setDraftState] = useState<Draft>(
    () =>
      (editing ? { front: editing.front, back: editing.back } : drafts.get(deckId)) ?? {
        front: "",
        back: "",
      },
  );
  const [side, setSide] = useState<Side>("front");
  const [draftKey, setDraftKey] = useState(0);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);

  const setDraft = (next: Draft) => {
    setDraftState(next);
    if (!editing) drafts.set(deckId, next);
  };

  const save = useMutation({
    mutationFn: () => {
      const front = draft.front.trim();
      const back = draft.back.trim();
      return editing ? updateCard(editing.id, { front, back }) : createCard(deckId, front, back);
    },
    onSuccess: async () => {
      await invalidateDeck(queryClient, deckId);
      if (editing) return onDone();
      drafts.delete(deckId);
      setDraftState({ front: "", back: "" });
      setSide("front");
      setDraftKey((k) => k + 1);
    },
  });
  const status = statusOf(save);

  useEffect(() => {
    const el = (side === "front" ? frontRef : backRef).current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [side, draftKey]);

  const submit = () => {
    if (save.isPending) return;
    if (!draft.front.trim()) return setSide("front");
    if (!draft.back.trim()) return setSide("back");
    save.mutate();
  };

  const leave = () => {
    const changed =
      editing &&
      (draft.front.trim() !== editing.front || draft.back.trim() !== editing.back) &&
      draft.front.trim() &&
      draft.back.trim();
    if (changed) save.mutate();
    else onDone();
  };

  const flip = () => setSide((s) => (s === "front" ? "back" : "front"));

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      leave();
    } else if (e.key === "Tab") {
      e.preventDefault();
      flip();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (side === "front") setSide("back");
      else submit();
    }
  };

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
            Supports **bold**, *italic*, `code` and $math$
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
                  <FaceInput
                    side="front"
                    textareaRef={frontRef}
                    value={draft.front}
                    onChange={(front) => setDraft({ ...draft, front })}
                    onKeyDown={onKeyDown}
                    placeholder="Question, term or prompt"
                  />
                </CardSurface>
              }
              back={
                <CardSurface side="back" label="Back" corner={corner} invalid={save.isError}>
                  <FaceInput
                    side="back"
                    textareaRef={backRef}
                    value={draft.back}
                    onChange={(back) => setDraft({ ...draft, back })}
                    onKeyDown={onKeyDown}
                    placeholder="Answer"
                  />
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
        <HintButton
          keys="Enter"
          onClick={() => (side === "front" ? setSide("back") : submit())}
          icon={side === "back" ? <StatusIcon status={status} idle={null} size={13} /> : null}
        >
          {side === "front" ? "Flip to back" : submitLabel}
        </HintButton>
        <span className="flex h-8 items-center gap-1.5 px-3 text-xs text-muted-foreground">
          <Kbd>⇧ Enter</Kbd>
          New line
        </span>
        <HintButton keys="Esc" onClick={leave}>
          Done
        </HintButton>
      </div>
      <div className="flex justify-center">
        <FieldError
          message={
            save.isError &&
            (editing
              ? "Couldn't save the card, press Enter to try again"
              : "Couldn't add the card, press Enter to try again")
          }
        />
      </div>
    </div>
  );
}

function FaceInput({
  side,
  value,
  onChange,
  onKeyDown,
  placeholder,
  textareaRef,
}: {
  side: Side;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, textareaRef]);

  return (
    <label
      className={cn(
        "flex min-h-0 flex-1 overflow-y-auto px-6",
        side === "front" ? "items-center pb-7" : "pt-7 pb-2",
      )}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={side === "front" ? "Card front" : "Card back"}
        className={cn(
          "w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted-foreground/50",
          side === "front" ? cn("text-center font-medium", faceTextSize(value)) : "text-base/7",
        )}
      />
    </label>
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
