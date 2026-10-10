import {
  IconBell,
  IconFileImport,
  IconFileText,
  IconKeyboard,
  IconLink,
  IconMoodSmile,
  IconNotebook,
  IconRepeat,
  IconRobot,
  IconShare,
  IconSparkles,
  IconTable,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

/// The icons a highlight in `whats-new.json` can name. Anything else shows the sparkles,
/// and a test fails for a name that is missing here, so a typo is caught before release.
const ICONS = new Map<string, TablerIcon>([
  ["bell", IconBell],
  ["file-import", IconFileImport],
  ["file-text", IconFileText],
  ["keyboard", IconKeyboard],
  ["link", IconLink],
  ["mood-smile", IconMoodSmile],
  ["notebook", IconNotebook],
  ["repeat", IconRepeat],
  ["robot", IconRobot],
  ["share", IconShare],
  ["sparkles", IconSparkles],
  ["table", IconTable],
]);

export const ICON_NAMES = [...ICONS.keys()];

export function whatsNewIcon(name: string | undefined): TablerIcon {
  return (name ? ICONS.get(name) : undefined) ?? IconSparkles;
}
