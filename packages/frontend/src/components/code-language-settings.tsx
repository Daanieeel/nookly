import { SelectField } from "#/components/select-field.tsx";
import { codeLanguageOptions } from "#/features/notes/code-language-options.tsx";
import { useDefaultCodeLanguage } from "#/features/notes/default-code-language.ts";

/// The language new code blocks start with, unless a note picks its own.
export function CodeLanguageSettings() {
  const { language, update } = useDefaultCodeLanguage();
  return (
    <SelectField
      aria-label="Default code language"
      searchable
      searchPlaceholder="Search languages…"
      options={codeLanguageOptions()}
      value={language}
      onChange={update}
    />
  );
}
