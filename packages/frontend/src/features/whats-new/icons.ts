import {
  IconBell,
  IconCards,
  IconChartLine,
  IconFileExport,
  IconFileImport,
  IconFileText,
  IconFilter,
  IconKeyboard,
  IconLayoutColumns,
  IconLink,
  IconMoodSmile,
  IconNotebook,
  IconPalette,
  IconRepeat,
  IconRobot,
  IconShare,
  IconSparkles,
  IconTerminal2,
  IconTable,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

/// The icons a highlight in `whats-new.json` can name. Anything else shows the sparkles,
/// and a test fails for a name that is missing here, so a typo is caught before release.
const ICONS = new Map<string, TablerIcon>([
  ["bell", IconBell],
  ["cards", IconCards],
  ["chart-line", IconChartLine],
  ["file-export", IconFileExport],
  ["file-import", IconFileImport],
  ["file-text", IconFileText],
  ["filter", IconFilter],
  ["keyboard", IconKeyboard],
  ["layout-columns", IconLayoutColumns],
  ["link", IconLink],
  ["mood-smile", IconMoodSmile],
  ["notebook", IconNotebook],
  ["palette", IconPalette],
  ["repeat", IconRepeat],
  ["robot", IconRobot],
  ["share", IconShare],
  ["sparkles", IconSparkles],
  ["table", IconTable],
  ["terminal", IconTerminal2],
]);

export const ICON_NAMES = [...ICONS.keys()];

export function whatsNewIcon(name: string | undefined): TablerIcon {
  return (name ? ICONS.get(name) : undefined) ?? IconSparkles;
}
