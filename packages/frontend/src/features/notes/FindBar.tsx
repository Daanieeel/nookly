import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  IconLetterCase,
  IconRegex,
  IconReplace,
  IconSelectAll,
  IconX,
} from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { Kbd, KbdGroup } from "#/components/kbd.tsx";
import { OPEN_LAYERS } from "#/hooks/use-escape-back.ts";
import {
  closeFind,
  findStateOf,
  replaceAll,
  replaceCurrent,
  selectAllMatches,
  setFind,
  stepFind,
} from "./find-in-page";

/// The text the find field starts with: the selection, when it sits in one line.
export function selectedSearchText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection;
  if (empty) return "";
  return editor.state.doc.textBetween(from, to, "\n", "￼").replace(/￼/g, "");
}

/// Layers that take an Escape of their own, other than the bar itself.
const OPEN_LAYERS_BESIDES_BAR = OPEN_LAYERS.replace(",[data-owns-escape]", "");

/// Closes the bar. The focus goes back to the page, unless `restoreFocus` is off: an Escape
/// pressed with nothing in the bar focused leaves nothing to type into, so the next Escape
/// goes back (`use-escape-back.ts`) instead of first leaving the page's text.
function closeBar(editor: Editor, onClose: () => void, restoreFocus = true) {
  onClose();
  // The match the search is on stays selected otherwise, and the next search would start
  // from it.
  const { from, to } = editor.state.selection;
  const onMatch = findStateOf(editor.state).matches.some(
    (match) => match.from === from && match.to === to,
  );
  if (onMatch) {
    if (restoreFocus) editor.chain().focus().setTextSelection(to).run();
    else editor.commands.setTextSelection(to);
  } else if (restoreFocus) editor.commands.focus();
}

function IconTip({
  label,
  keys,
  children,
}: {
  label: string;
  keys?: string[];
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        {label}
        {keys && (
          <KbdGroup>
            {keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function Toggle({
  label,
  pressed,
  onPressedChange,
  children,
}: {
  label: string;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
}) {
  return (
    <IconTip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={() => onPressedChange(!pressed)}
        className={cn(
          "ml-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-inset text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
          pressed && "bg-primary/20 text-foreground ring-1 ring-primary/60",
        )}
      >
        {children}
      </button>
    </IconTip>
  );
}

/// A floating find and replace bar at the top right of a page, like the one in VS Code. The
/// search itself lives in `find-in-page.ts`; this sets it and shows what it found.
export function FindBar({
  editor,
  open,
  focusToken,
  seed,
  onClose,
}: {
  editor: Editor | null;
  open: boolean;
  /// Changes each time the shortcut is pressed, so the field takes the focus again.
  focusToken: number;
  /// The text the field starts with when the bar is opened.
  seed: string;
  onClose: () => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      ...findStateOf(current?.state ?? null),
      editable: current?.isEditable ?? false,
    }),
  });
  const find = state ?? { ...findStateOf(null), editable: false };
  const [showReplace, setShowReplace] = useState(false);
  const [replacement, setReplacement] = useState("");
  const queryRef = useRef<HTMLInputElement>(null);

  // Opening, or pressing the shortcut again: starts from the selection and takes the focus.
  useEffect(() => {
    if (!open || !editor || editor.isDestroyed) return;
    if (seed) setFind(editor.view, { query: seed });
    queryRef.current?.focus();
    queryRef.current?.select();
    // `seed` is read when the shortcut was pressed, so only the token re-runs this.
  }, [open, focusToken, editor]); // oxlint-disable-line react-hooks/exhaustive-deps

  // Closing clears the matches, and the next time the bar opens it starts fresh.
  useEffect(() => {
    if (open) return;
    setReplacement("");
    setShowReplace(false);
    if (editor && !editor.isDestroyed) closeFind(editor.view);
  }, [open, editor]);

  // The current match scrolls to the middle of the page's view.
  useEffect(() => {
    if (!open || !editor || editor.isDestroyed || find.current < 0) return;
    editor.view.dom
      .querySelector(".find-match-current")
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [open, editor, find.current, find.matches]);

  // Escape closes the bar wherever the focus is, as a click on one of its buttons may not
  // focus them. `data-owns-escape` keeps the page from also going back (`use-escape-back.ts`).
  useEffect(() => {
    if (!open || !editor) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector(OPEN_LAYERS_BESIDES_BAR)) return;
      event.preventDefault();
      const inBar = document.activeElement?.closest("[role=search]") != null;
      closeBar(editor, onClose, inBar);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, editor, onClose]);

  if (!open || !editor) return null;
  const view = editor.view;

  const close = () => closeBar(editor, onClose);
  const onFindKey = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.altKey) {
        if (selectAllMatches(view)) view.focus();
      } else stepFind(view, event.shiftKey ? -1 : 1);
    }
  };
  const onReplaceKey = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) replaceAll(view, replacement);
      else replaceCurrent(view, replacement);
    }
  };

  const total = find.matches.length;
  const status = find.invalid
    ? "Invalid expression"
    : !find.query
      ? ""
      : total === 0
        ? "No results"
        : `${find.current + 1} of ${total}`;
  const canReplace = find.editable && total > 0;

  return (
    <div className="pointer-events-none sticky top-2 z-30 h-0">
      <div
        role="search"
        aria-label="Find in page"
        data-owns-escape
        className="pointer-events-auto absolute top-0 right-2 grid w-md max-w-[calc(100%-1rem)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-lg"
      >
        <IconTip label={showReplace ? "Hide Replace" : "Show Replace"}>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label={showReplace ? "Hide Replace" : "Show Replace"}
            aria-expanded={showReplace}
            onClick={() => setShowReplace((shown) => !shown)}
            className="h-8"
          >
            {showReplace ? <IconChevronDown /> : <IconChevronRight />}
          </Button>
        </IconTip>
        <div
          className={cn(
            "flex h-8 min-w-0 items-center gap-0.5 rounded-md border bg-accent pr-1 shadow-xs transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-accent/80",
            find.invalid ? "border-destructive" : "border-input",
          )}
        >
          <input
            ref={queryRef}
            aria-label="Find"
            aria-invalid={find.invalid || undefined}
            placeholder="Find"
            spellCheck={false}
            value={find.query}
            onChange={(event) => setFind(view, { query: event.target.value })}
            onKeyDown={onFindKey}
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-0.5">
            <Toggle
              label="Match Case"
              pressed={find.caseSensitive}
              onPressedChange={(caseSensitive) => setFind(view, { caseSensitive })}
            >
              <IconLetterCase />
            </Toggle>
            <Toggle
              label="Match Whole Word"
              pressed={find.wholeWord}
              onPressedChange={(wholeWord) => setFind(view, { wholeWord })}
            >
              <span aria-hidden className="text-xs leading-none font-semibold">
                ab
              </span>
            </Toggle>
            <Toggle
              label="Use Regular Expression"
              pressed={find.regex}
              onPressedChange={(regex) => setFind(view, { regex })}
            >
              <IconRegex />
            </Toggle>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span
            role="status"
            className={cn(
              "min-w-16 shrink-0 text-center text-xs text-muted-foreground tabular-nums",
              (find.invalid || (find.query && total === 0)) && "text-destructive",
            )}
          >
            {status}
          </span>
          <IconTip label="Previous Match" keys={["Shift", "Enter"]}>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Previous Match"
              disabled={total === 0}
              onClick={() => stepFind(view, -1)}
            >
              <IconArrowUp />
            </Button>
          </IconTip>
          <IconTip label="Next Match" keys={["Enter"]}>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Next Match"
              disabled={total === 0}
              onClick={() => stepFind(view, 1)}
            >
              <IconArrowDown />
            </Button>
          </IconTip>
          <IconTip label="Select All Occurrences" keys={["Alt", "Enter"]}>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Select All Occurrences"
              disabled={total === 0 || !find.editable}
              onClick={() => {
                if (selectAllMatches(view)) view.focus();
              }}
            >
              <IconSelectAll />
            </Button>
          </IconTip>
          <IconTip label="Close" keys={["Esc"]}>
            <Button variant="ghost" size="iconSm" aria-label="Close Find" onClick={close}>
              <IconX />
            </Button>
          </IconTip>
        </div>
        {showReplace && (
          <>
            <span aria-hidden />
            <Input
              aria-label="Replace With"
              placeholder="Replace"
              spellCheck={false}
              value={replacement}
              disabled={!find.editable}
              onChange={(event) => setReplacement(event.target.value)}
              onKeyDown={onReplaceKey}
            />
            <div className="flex items-center gap-1">
              <IconTip label="Replace Match" keys={["Enter"]}>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Replace Match"
                  disabled={!canReplace}
                  onClick={() => replaceCurrent(view, replacement)}
                >
                  <IconReplace />
                </Button>
              </IconTip>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canReplace}
                onClick={() => replaceAll(view, replacement)}
              >
                Replace All
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
