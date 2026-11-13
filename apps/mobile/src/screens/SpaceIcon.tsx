import { isSharedSpace } from "@nookly/shared/api";
import type { Space } from "@nookly/shared/data";
import { IconFolder, IconUsers } from "@tabler/icons-react-native";
import { IconValue } from "../ui/icons.tsx";

/// A Space's own icon (an emoji or a library icon) in its color, a folder without one, as
/// the desktop's `SpaceIcon`. A Space shared with you shows people.
export function SpaceIcon({ space, size = 18 }: { space: Space; size?: number }) {
  if (isSharedSpace(space.id)) return <IconUsers size={size} color={space.color} />;
  if (space.icon) return <IconValue value={space.icon} size={size} fallback={space.color} />;
  return <IconFolder size={size} color={space.color} />;
}
