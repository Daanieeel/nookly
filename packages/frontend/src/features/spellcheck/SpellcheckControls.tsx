import { IconFileCode } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import { revealDictionaryFile } from "#/lib/api/spell.ts";
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

/// Shows `dictionary.json`, the user's own words, in Finder. The result shows on the button.
export function DictionaryFileButton() {
  const open = useMutation({ mutationFn: revealDictionaryFile });
  const status = useActionStatus(open);
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label="Show dictionary file"
      onClick={() => !open.isPending && open.mutate()}
    >
      <StatusButtonContent
        status={status}
        icon={<IconFileCode size={14} />}
        label="Show dictionary file"
        errorLabel="Couldn't show, try again"
      />
    </Button>
  );
}
