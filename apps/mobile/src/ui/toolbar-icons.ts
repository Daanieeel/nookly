import camera from "../../assets/toolbar/camera.png";
import collapse from "../../assets/toolbar/layout-sidebar-right-collapse.png";
import expand from "../../assets/toolbar/layout-sidebar-right-expand.png";
import more from "../../assets/toolbar/dots.png";
import menu from "../../assets/toolbar/layout-sidebar-left-expand.png";
import settings from "../../assets/toolbar/settings.png";
import plus from "../../assets/toolbar/plus.png";
import search from "../../assets/toolbar/search.png";
import share from "../../assets/toolbar/share.png";
import wand from "../../assets/toolbar/wand.png";

/// The desktop's Tabler icons for the system's bar buttons (`Stack.Toolbar.Button`), which
/// take an image and tint it like their own. Drawn from
/// `@tabler/icons/icons/outline` at 22 points, 1x to 3x.
export const TOOLBAR_ICONS = {
  plus,
  scan: camera,
  search,
  share,
  more,
  menu,
  settings,
  showDetails: expand,
  hideDetails: collapse,
  wand,
};
