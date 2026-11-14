import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { Chip, ChipGroup } from "./Chips.tsx";
import { ListHeader, type ListPanel } from "./ListBar.tsx";
import { DisplayGroup, FilterField } from "./sheet/DisplayParts.tsx";
import type { Option } from "./sheet/OptionList.tsx";
import { Sheet } from "./sheet/Sheet.tsx";

/// One field of a list's Filter sheet: its name and icon, what it offers, what is ticked.
export interface ListFilter {
  label: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
  options: Option<string>[];
  values: string[];
  onChange: (values: string[]) => void;
}

/// A list page's top, as Tasks has it (D65): the title with how many and Filter and Display;
/// the filters that are on as chips to take off; the Filter sheet with a row per field
/// (one with nothing to offer is left out) and the Display sheet with what the page shows.
export function ListControls({
  title,
  count,
  filters,
  display,
}: {
  title: string;
  count: number;
  filters: ListFilter[];
  /// What the Display sheet holds; a page without display options leaves it out.
  display?: ReactNode;
}) {
  const [panel, setPanel] = useState<ListPanel>(null);
  const close = (open: boolean) => !open && setPanel(null);
  const active = filters.flatMap((field) =>
    field.values.map((value) => ({
      key: `${field.label}-${value}`,
      label: field.options.find((o) => o.id === value)?.label ?? value,
      remove: () => field.onChange(field.values.filter((v) => v !== value)),
    })),
  );
  return (
    <>
      <ListHeader
        title={title}
        count={count}
        panel={panel}
        onPanel={setPanel}
        display={display !== undefined}
      />
      {active.length > 0 ? (
        <ChipGroup label="Active filters" multiple>
          {active.map((f) => (
            <Chip key={f.key} label={`${f.label} ×`} multiple selected onPress={f.remove} />
          ))}
        </ChipGroup>
      ) : null}
      <Sheet open={panel === "filter"} onOpenChange={close} title="Filter">
        <DisplayGroup>
          {filters
            .filter((field) => field.options.length > 0)
            .map((field) => (
              <FilterField
                key={field.label}
                label={field.label}
                icon={field.icon}
                values={field.values}
                options={field.options}
                onChange={field.onChange}
              />
            ))}
        </DisplayGroup>
      </Sheet>
      <Sheet open={panel === "display"} onOpenChange={close} title="Display">
        {display}
      </Sheet>
    </>
  );
}
