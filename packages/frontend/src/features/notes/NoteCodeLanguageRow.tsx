import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PropertyRow } from "#/components/property-row.tsx";
import { SelectField } from "#/components/select-field.tsx";
import { getNoteCodeLanguage, setNoteCodeLanguage } from "#/lib/api/notes.ts";
import { qk } from "#/lib/query-keys.ts";
import { codeLanguageOptions } from "./code-language-options";

const USE_DEFAULT = "default";

/// A note's own starting language for new code blocks, or the app default.
/// Existing code blocks keep the language they have.
export function NoteCodeLanguageRow({ entityId }: { entityId: string }) {
  const queryClient = useQueryClient();
  const queryKey = qk.noteCodeLanguage(entityId);
  const { data: language = null } = useQuery({
    queryKey,
    queryFn: () => getNoteCodeLanguage(entityId),
  });
  const set = useMutation({
    mutationFn: (next: string | null) => setNoteCodeLanguage(entityId, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  return (
    <section aria-label="Properties" className="flex flex-col gap-0.5">
      <PropertyRow label="Code">
        <SelectField
          aria-label="Code language for new code blocks"
          searchable
          searchPlaceholder="Search languages…"
          options={codeLanguageOptions([{ value: USE_DEFAULT, label: "Use default" }])}
          value={language ?? USE_DEFAULT}
          onChange={(value) => set.mutate(value === USE_DEFAULT ? null : value)}
        />
      </PropertyRow>
    </section>
  );
}
