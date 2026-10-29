import { IconBookmarkPlus, IconEyeOff, IconTextSpellcheck } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { registerActions } from "#/components/context-menu/registry.ts";
import type { MenuSubItem } from "#/components/context-menu/registry.ts";
import { qk } from "#/lib/query-keys.ts";
import type { NoteBlockTarget } from "../notes/context-actions";
import { spellController } from "./spell-controller";

/// Puts a suggestion in place of the misspelled word that was right clicked, as one undo step.
/// Nothing happens when the text at that place is no longer that word.
export function replaceMisspelled(target: NoteBlockTarget, suggestion: string): boolean {
  const { misspelled, editor } = target;
  if (!misspelled) return false;
  const { state, view } = editor;
  if (misspelled.to > state.doc.content.size) return false;
  if (state.doc.textBetween(misspelled.from, misspelled.to) !== misspelled.word) return false;
  view.dispatch(state.tr.insertText(suggestion, misspelled.from, misspelled.to));
  return true;
}

/// The corrections for the word, asked for while the submenu is open.
function useSuggestions(target: NoteBlockTarget): MenuSubItem[] | undefined {
  const word = target.misspelled?.word ?? "";
  const { data } = useQuery({
    queryKey: qk.spellSuggestions(word),
    queryFn: () => spellController().suggest(word),
    enabled: word !== "",
    staleTime: 60_000,
  });
  return data?.map((suggestion) => ({
    id: suggestion,
    label: suggestion,
    run: () => {
      replaceMisspelled(target, suggestion);
    },
  }));
}

const onMisspelled = (target: NoteBlockTarget) => target.misspelled !== undefined;

registerActions("note.block", [
  {
    id: "spell-suggestions",
    group: "spelling",
    label: "Spelling Suggestions",
    icon: IconTextSpellcheck,
    when: onMisspelled,
    useItems: useSuggestions,
    emptyLabel: "No suggestions",
  },
  {
    id: "spell-ignore",
    group: "spelling",
    label: "Ignore Spelling",
    icon: IconEyeOff,
    when: onMisspelled,
    run: ({ misspelled }) => {
      if (misspelled) return spellController().ignore(misspelled.word);
    },
  },
  {
    id: "spell-add",
    group: "spelling",
    label: "Add to Dictionary",
    icon: IconBookmarkPlus,
    when: onMisspelled,
    run: ({ misspelled }) => {
      if (misspelled) spellController().addWord(misspelled.word);
    },
  },
]);
