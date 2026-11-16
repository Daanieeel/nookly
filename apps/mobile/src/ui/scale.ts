import { GUTTER, TABLET_SIZE, TABLET_TYPE, TYPE } from "./tokens.ts";
import { useIsTablet } from "./pane.tsx";
import { LIST_ROW } from "./touch.ts";

/// The sizes a part draws at: the phone's, or a tablet's denser desktop scale (3.1).
export interface Scale {
  type: typeof TYPE | typeof TABLET_TYPE;
  row: number;
  gutter: number;
}

const PHONE: Scale = { type: TYPE, row: LIST_ROW.minHeight, gutter: GUTTER };
const TABLET: Scale = {
  type: TABLET_TYPE,
  row: TABLET_SIZE.row,
  gutter: TABLET_SIZE.gutter,
};

export function useScale(): Scale {
  return useIsTablet() ? TABLET : PHONE;
}
