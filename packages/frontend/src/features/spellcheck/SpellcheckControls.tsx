import { IconX } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { Checkbox } from "@nookly/ui/components/checkbox";
import { SPELL_LANGUAGES } from "#/lib/spell-languages.ts";
import { useSetting } from "#/lib/settings/settings.ts";

/// One checkbox per language there is a dictionary for. Several can be ticked: a word is
/// right when it is right in any of them. `onChange` gets the ticked codes in the order of
/// the list.
export function LanguageChecklist({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div role="group" aria-label="Languages" className="grid grid-cols-2 gap-x-6 gap-y-2">
      {SPELL_LANGUAGES.map((language) => {
        const id = `spell-language-${language.code}`;
        return (
          <label key={language.code} htmlFor={id} className="flex items-center gap-2 text-sm">
            <Checkbox
              id={id}
              checked={value.includes(language.code)}
              onCheckedChange={(checked) =>
                onChange(
                  SPELL_LANGUAGES.map((l) => l.code).filter((code) =>
                    code === language.code ? checked === true : value.includes(code),
                  ),
                )
              }
            />
            {language.label}
          </label>
        );
      })}
    </div>
  );
}

/// The languages words are checked in, saved as they are ticked.
export function SpellLanguagesControl() {
  const [languages, setLanguages] = useSetting("notes.spellcheckLanguages");
  return <LanguageChecklist value={languages} onChange={setLanguages} />;
}

/// The words the user added to their own dictionary, each with a way to take it out again.
export function SpellWordsControl() {
  const [words, setWords] = useSetting("notes.spellcheckWords");
  if (words.length === 0) {
    return <span className="text-xs text-muted-foreground">No words added yet.</span>;
  }
  return (
    <ul aria-label="Words you added" className="flex max-w-sm flex-wrap justify-end gap-1.5">
      {words.map((word) => (
        <li
          key={word}
          className="flex items-center gap-1 rounded-md border border-border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs"
        >
          {word}
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            aria-label={`Remove ${word}`}
            onClick={() => setWords(words.filter((w) => w !== word))}
          >
            <IconX size={11} />
          </Button>
        </li>
      ))}
    </ul>
  );
}
