import {
  type BoardMenuProps,
  BoardOrderingRows,
  boardGroupings,
  DisplayPopover,
  LayoutTiles,
  LIST_BOARD_TILES,
  SelectRow,
  SubGroupingRow,
} from "#/features/display-menu.tsx";
import {
  type DisplayOptions,
  GROUPINGS,
  type Grouping,
  ORDERINGS,
  validSubGrouping,
} from "./assignment-model";

/// The "Display" popover, as on the Tasks page: layout, grouping, sub-grouping
/// and empty groups.
export function AssignmentDisplayMenu({
  display,
  onChange,
  columns,
  crossSpace = false,
}: BoardMenuProps<DisplayOptions>) {
  const set = (patch: Partial<DisplayOptions>) => onChange({ ...display, ...patch });
  const available = GROUPINGS.filter((g) => crossSpace || g.id !== "space");
  const { groupings, subGroupings } = boardGroupings(available, display);
  const setGrouping = (grouping: Grouping, layout = display.layout) =>
    set({ layout, grouping, subGrouping: validSubGrouping(grouping, display.subGrouping) });

  return (
    <DisplayPopover variant="secondary" wide>
      <LayoutTiles
        tiles={LIST_BOARD_TILES}
        value={display.layout}
        onSelect={(id) =>
          setGrouping(
            // A board opens on status columns, which cards can be dragged
            // between, unless it already groups by something draggable.
            id === "board" && display.layout !== "board" && display.grouping !== "course"
              ? "status"
              : display.grouping,
            id,
          )
        }
      />
      <SelectRow
        label="Grouping"
        value={display.grouping}
        options={groupings}
        fallback="deadline"
        wide
        onChange={setGrouping}
      />
      <SubGroupingRow display={display} options={subGroupings} set={set} />
      <BoardOrderingRows
        display={display}
        orderings={ORDERINGS}
        fallback="auto"
        columns={columns}
        set={set}
      />
    </DisplayPopover>
  );
}
