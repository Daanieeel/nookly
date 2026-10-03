import { CardDisplayMenu } from "#/features/display-menu.tsx";
import { type DisplayOptions, GROUPINGS, ORDERINGS } from "./file-model";

/// The "Display" popover, as on Tasks and Bookmarks: layout, grouping, ordering.
export function FileDisplayMenu({
  display,
  onChange,
}: {
  display: DisplayOptions;
  onChange: (display: DisplayOptions) => void;
}) {
  return (
    <CardDisplayMenu
      display={display}
      onChange={onChange}
      groupings={GROUPINGS}
      orderings={ORDERINGS}
    />
  );
}
