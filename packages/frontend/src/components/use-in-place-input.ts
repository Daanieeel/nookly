import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";

/// Behavior of a text input edited in place: it commits on blur or Enter, and Escape
/// restores `value`. `commit` receives the draft and a `reset` that restores `value`.
/// With `stopEscape`, Escape does not reach a surrounding dialog or sheet.
export function useInPlaceInput({
  value,
  commit,
  stopEscape = false,
}: {
  value: string;
  commit: (draft: string, reset: () => void) => void;
  stopEscape?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const reset = () => setDraft(value);

  return {
    value: draft,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onBlur: () => commit(draft, reset),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") e.currentTarget.blur();
      if (e.key === "Escape") {
        if (stopEscape) e.stopPropagation();
        const input = e.currentTarget;
        reset();
        // After the reset renders, so the blur saves nothing.
        requestAnimationFrame(() => input.blur());
      }
    },
  };
}
