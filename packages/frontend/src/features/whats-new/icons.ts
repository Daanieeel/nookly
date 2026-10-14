import {
  IconBell,
  IconCards,
  IconCloud,
  IconCloudUp,
  IconDeviceMobile,
  IconFileExport,
  IconFileImport,
  IconFileText,
  IconKeyboard,
  IconLayoutColumns,
  IconLink,
  IconMoodSmile,
  IconNotebook,
  IconRepeat,
  IconRobot,
  IconShare,
  IconSparkles,
  IconTerminal2,
  IconTable,
  IconUserCircle,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

/// The icons a highlight in `whats-new.json` can name. Anything else shows the sparkles,
/// and a test fails for a name that is missing here, so a typo is caught before release.
const ICONS = new Map<string, TablerIcon>([
  ["bell", IconBell],
  ["cards", IconCards],
  ["cloud", IconCloud],
  ["cloud-up", IconCloudUp],
  ["device-mobile", IconDeviceMobile],
  ["file-export", IconFileExport],
  ["file-import", IconFileImport],
  ["file-text", IconFileText],
  ["keyboard", IconKeyboard],
  ["layout-columns", IconLayoutColumns],
  ["link", IconLink],
  ["mood-smile", IconMoodSmile],
  ["notebook", IconNotebook],
  ["repeat", IconRepeat],
  ["robot", IconRobot],
  ["share", IconShare],
  ["sparkles", IconSparkles],
  ["table", IconTable],
  ["terminal", IconTerminal2],
  ["user-circle", IconUserCircle],
]);

export const ICON_NAMES = [...ICONS.keys()];

export function whatsNewIcon(name: string | undefined): TablerIcon {
  return (name ? ICONS.get(name) : undefined) ?? IconSparkles;
}
