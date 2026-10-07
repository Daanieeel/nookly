import { SelectField } from "#/components/select-field.tsx";
import { codeLanguageOptions } from "#/features/notes/code-language-options.tsx";
import { useDefaultCodeLanguage } from "#/features/notes/default-code-language.ts";

/// The language new code blocks start with, unless a note picks its own.
export function CodeLanguageSettings() {
  const { language, update } = useDefaultCodeLanguage();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">Code blocks</span>
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 text-sm">
        <span className="text-muted-foreground">Language</span>
        <SelectField
          aria-label="Default code language"
          searchable
          searchPlaceholder="Search languages…"
          options={codeLanguageOptions()}
          value={language}
          onChange={update}
        />
      </div>
    </div>
  );
}
