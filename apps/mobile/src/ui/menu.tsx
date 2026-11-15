import { createContext, useContext } from "react";
import type { Confirmation } from "./sheet/Confirm.tsx";
import type { MenuEntry } from "./sheet/MenuList.tsx";
import { useOptionalSheetHost } from "./sheet/SheetHost.tsx";
import type { Anchor } from "./sheet/anchor.ts";

export { SEPARATOR, type MenuEntry, type MenuIcon, type MenuItem } from "./sheet/MenuList.tsx";
export type { Confirmation } from "./sheet/Confirm.tsx";

/// How a menu of actions and a confirmation are shown: in the app's sheet (`SheetHost`). A
/// test supplies its own to read and choose actions without a screen.
/// `card` shows the menu as a dialog in the middle of the screen (D65's floating card)
/// rather than a sheet from the bottom.
/// On a tablet a menu is a popover on `anchor` (the button, or the point a long press
/// was at, `pointAnchor`), and a `context` menu says it came from a long press.
export interface MenuOptions {
  presentation?: "sheet" | "card";
  anchor?: Anchor;
  kind?: "menu" | "context";
}

export interface MenuPresenter {
  show(title: string | undefined, entries: MenuEntry[], options?: MenuOptions): void;
  confirm(confirmation: Confirmation): void;
}

const MenuContext = createContext<MenuPresenter | null>(null);
export const MenuProvider = MenuContext.Provider;

export function useMenu(): MenuPresenter {
  const own = useContext(MenuContext);
  const host = useOptionalSheetHost();
  if (own) return own;
  if (!host) throw new Error("useMenu needs a SheetHost or a MenuProvider around the app");
  return { show: host.menu, confirm: host.confirm };
}
