import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { ActiveFilters } from "./ActiveFilters.tsx";
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
/// the filters that are on as the desktop's chips, one per field; the Filter sheet with a row per field (one
/// with nothing to offer yet says so when opened, so the sheet is never empty) and the
/// Display sheet with what the page shows.
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
  return (
    <>
      <ListHeader
        title={title}
        count={count}
        panel={panel}
        onPanel={setPanel}
        display={display !== undefined}
      />
      <ActiveFilters filters={filters} />
      <Sheet open={panel === "filter"} onOpenChange={close} title="Filter">
        <DisplayGroup>
          {filters.map((field) => (
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
