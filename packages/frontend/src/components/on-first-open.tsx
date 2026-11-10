import { type ReactNode, Suspense, useState } from "react";
import { useNavStore } from "#/lib/store/nav.ts";
import type { NavState } from "#/lib/store/nav-types.ts";

/// Loads a dialog's code the first time it opens, then keeps it mounted so it can close with
/// its own animation. It reads the open flag itself: if the app shell did, every open and
/// close would re-render the whole app (sidebar, the open page) and freeze it for a moment.
export function OnFirstOpen({
  isOpen,
  children,
}: {
  isOpen: (state: NavState) => boolean;
  children: ReactNode;
}) {
  const open = useNavStore(isOpen);
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened ? <Suspense fallback={null}>{children}</Suspense> : null;
}
