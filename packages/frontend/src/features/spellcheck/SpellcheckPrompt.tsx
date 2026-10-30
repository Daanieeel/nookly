import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";
import { Button } from "@nookly/ui/components/button";
import { preferences } from "#/lib/preferences.ts";
import { settings, useSetting } from "#/lib/settings/settings.ts";
import { suggestedSpellLanguages } from "#/lib/spell-languages.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { LanguageChecklist } from "./SpellcheckControls";

/// The one time Nookly asks whether to check spelling, after the update that adds it. The
/// dialog has no way out but a choice, and the answer is remembered on this computer, so it
/// is not asked again; the choice is Settings under Editor from then on. Someone who already
/// turned the spell checker on is not asked.
export function SpellcheckPrompt() {
  const [enabled] = useSetting("notes.spellcheck");
  const [answered, setAnswered] = useState(
    () => preferences.get(STORAGE_KEYS.spellcheckAsked) === "1",
  );
  // Not on top of What's new, which shows at the same moment after an update.
  const whatsNewOpen = useNavStore((s) => s.whatsNewOpen);
  const [languages, setLanguages] = useState(() => suggestedSpellLanguages(navigator.languages));

  const answer = (turnOn: boolean) => {
    if (turnOn) {
      settings.apply([
        { id: "notes.spellcheckLanguages", value: languages },
        { id: "notes.spellcheck", value: true },
      ]);
    }
    preferences.set(STORAGE_KEYS.spellcheckAsked, "1");
    setAnswered(true);
  };

  return (
    <AlertDialog open={!answered && !enabled && !whatsNewOpen}>
      <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Check your spelling?</AlertDialogTitle>
          <AlertDialogDescription>
            Nookly can underline misspelled words while you write, and offer corrections on a right
            click. Everything is checked on your computer. A word is right when it is right in any
            language you pick, so a page can mix languages. You can change this later in Settings,
            under Editor.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <LanguageChecklist value={languages} onChange={setLanguages} />
        <AlertDialogFooter>
          <Button variant="secondary" onClick={() => answer(false)}>
            Not now
          </Button>
          <Button disabled={languages.length === 0} onClick={() => answer(true)}>
            Turn on
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
