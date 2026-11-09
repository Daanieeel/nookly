import { Switch } from "@nookly/ui/components/switch";
import { OptionRow } from "#/features/display-menu.tsx";
import { shownFields } from "./ViewTable.tsx";
import type { TableDisplay, ViewSource } from "./types.ts";

/// One switch per field of a source, for the "Display" popover while the table layout is
/// on: which columns the table shows. The title always shows.
export function TableColumnToggles<T, C>({
  source,
  table,
  onChange,
  hiddenFields = [],
}: {
  source: Pick<ViewSource<T, C>, "fields" | "defaultColumns">;
  table: TableDisplay;
  onChange: (table: TableDisplay) => void;
  hiddenFields?: string[];
}) {
  const shown = shownFields(source, table, hiddenFields).map(({ field, width }) => ({
    field: field.id,
    width,
  }));
  const fields = source.fields.filter((f) => f.id !== "title" && !hiddenFields.includes(f.id));
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">Columns</span>
      {fields.map((field) => (
        <OptionRow key={field.id} label={field.label}>
          <Switch
            aria-label={`Show ${field.label} column`}
            checked={shown.some((c) => c.field === field.id)}
            onCheckedChange={(checked) =>
              onChange({
                ...table,
                columns: checked
                  ? [...shown, { field: field.id }]
                  : shown.filter((c) => c.field !== field.id),
              })
            }
          />
        </OptionRow>
      ))}
    </div>
  );
}
