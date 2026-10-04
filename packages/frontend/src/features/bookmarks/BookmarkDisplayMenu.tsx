import { Switch } from "@nookly/ui/components/switch";
import { CardDisplayMenu, OptionRow } from "#/features/display-menu.tsx";
import { type DisplayOptions, GROUPINGS, ORDERINGS } from "./bookmark-model";

/// The "Display" popover, as on Tasks and Assignments: layout, grouping,
/// ordering and what each card shows.
export function BookmarkDisplayMenu({
  display,
  onChange,
}: {
  display: DisplayOptions;
  onChange: (display: DisplayOptions) => void;
}) {
  const set = (patch: Partial<DisplayOptions>) => onChange({ ...display, ...patch });

  return (
    <CardDisplayMenu
      display={display}
      onChange={onChange}
      groupings={GROUPINGS}
      orderings={ORDERINGS}
    >
      {display.layout === "grid" && (
        <OptionRow label="Preview images">
          <Switch
            checked={display.showPreviews}
            onCheckedChange={(showPreviews) => set({ showPreviews })}
          />
        </OptionRow>
      )}
      <OptionRow label="Descriptions">
        <Switch
          checked={display.showDescriptions}
          onCheckedChange={(showDescriptions) => set({ showDescriptions })}
        />
      </OptionRow>
    </CardDisplayMenu>
  );
}
