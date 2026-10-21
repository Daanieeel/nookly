import { createContext, useContext } from "react";
import type { Confirmation } from "./sheet/Confirm.tsx";
import type { MenuEntry } from "./sheet/MenuList.tsx";
import { useOptionalSheetHost } from "./sheet/SheetHost.tsx";

export { SEPARATOR, type MenuEntry, type MenuIcon, type MenuItem } from "./sheet/MenuList.tsx";
export type { Confirmation } from "./sheet/Confirm.tsx";

/// How a menu of actions and a confirmation are shown: in the app's sheet (`SheetHost`). A
/// test supplies its own to read and choose actions without a screen.
export interface MenuPresenter {
  show(title: string | undefined, entries: MenuEntry[]): void;
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
