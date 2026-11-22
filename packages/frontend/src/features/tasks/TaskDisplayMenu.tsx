import { Separator } from "@nookly/ui/components/separator";
import {
  type BoardMenuProps,
  BoardOrderingRows,
  boardGroupings,
  DisplayPopover,
  LayoutTiles,
  LIST_BOARD_TILES,
  PropertyChips,
  SelectRow,
  SubGroupingRow,
} from "#/features/display-menu.tsx";
import {
  DISPLAY_PROPERTIES,
  type DisplayOptions,
  GROUPINGS,
  ORDERINGS,
  validSubGrouping,
} from "./task-model";

/// Linear's "Display" popover: layout tiles, grouping and ordering, empty groups,
/// and which properties rows and cards show.
export function TaskDisplayMenu({
  display,
  onChange,
  columns,
  crossSpace = false,
}: BoardMenuProps<DisplayOptions>) {
  const set = (patch: Partial<DisplayOptions>) => onChange({ ...display, ...patch });
  const available = GROUPINGS.filter((g) => (crossSpace ? g.id !== "label" : g.id !== "space"));
  const { groupings, subGroupings } = boardGroupings(available, display);
  const properties = DISPLAY_PROPERTIES.filter((p) => !crossSpace || p.id !== "labels");
  // Ordering by status inside status groups would change nothing.
  const orderings = ORDERINGS.filter((o) => display.grouping !== "status" || o.id !== "status");

  return (
    <DisplayPopover variant="secondary" wide>
      <LayoutTiles
        tiles={LIST_BOARD_TILES}
        value={display.layout}
        onSelect={(id) => {
          const grouping =
            id === "board" && display.grouping === "none" ? "status" : display.grouping;
          set({
            layout: id,
            grouping,
            subGrouping: validSubGrouping(grouping, display.subGrouping),
          });
        }}
      />
      <SelectRow
        label="Grouping"
        value={display.grouping}
        options={groupings}
        fallback="status"
        wide
        onChange={(grouping) =>
          set({
            grouping,
            subGrouping: validSubGrouping(grouping, display.subGrouping),
            ordering:
              grouping === "status" && display.ordering === "status" ? "due" : display.ordering,
          })
        }
      />
      <SubGroupingRow display={display} options={subGroupings} set={set} />
      <BoardOrderingRows
        display={display}
        orderings={orderings}
        fallback="due"
        columns={columns}
        set={set}
      />

      <Separator />

      <PropertyChips
        properties={properties}
        selected={display.properties}
        onChange={(next) => set({ properties: next })}
      />
    </DisplayPopover>
  );
}
