import collapse from "../../assets/toolbar/layout-sidebar-right-collapse.png";
import expand from "../../assets/toolbar/layout-sidebar-right-expand.png";
import more from "../../assets/toolbar/dots.png";
import menu from "../../assets/toolbar/menu-2.png";
import settings from "../../assets/toolbar/settings.png";
import plus from "../../assets/toolbar/plus.png";

/// The desktop's Tabler icons for the system's bar buttons (`Stack.Toolbar.Button`), which
/// take an image (or an SF Symbol) and tint it like their own. Drawn from
/// `@tabler/icons/icons/outline` at 22 points, 1x to 3x.
export const TOOLBAR_ICONS = {
  plus,
  more,
  menu,
  settings,
  showDetails: expand,
  hideDetails: collapse,
};
