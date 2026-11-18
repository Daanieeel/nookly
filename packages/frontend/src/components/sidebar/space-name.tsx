import { isSharedSpace } from "@nookly/shared/api";
import { IconUsers } from "@tabler/icons-react";
import type { Space } from "#/lib/api/types.ts";

/// A Space's name in the sidebar. The Space that holds what someone shared with this
/// account carries a people icon, so it reads apart from the user's own Spaces.
export function SpaceName({ space }: { space: Pick<Space, "id" | "name"> }) {
  return (
    <>
      <span className="truncate">{space.name}</span>
      {isSharedSpace(space.id) && (
        <span className="flex shrink-0 items-center text-sidebar-foreground/60">
          <IconUsers aria-hidden className="size-3.5" />
          <span className="sr-only">Shared with you</span>
        </span>
      )}
    </>
  );
}
