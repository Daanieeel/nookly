import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { type Confirmation, ConfirmContent } from "./Confirm.tsx";
import { type MenuEntry, MenuList } from "./MenuList.tsx";
import { Sheet, type SheetSize } from "./Sheet.tsx";

interface Presented {
  title?: string;
  size?: SheetSize;
  content: ReactNode;
}

/// Opens a sheet from code (a menu from a long press, a confirmation), where no part of a
/// screen holds it. One at a time: a new one takes the place of the one up.
interface SheetPresenter {
  present(sheet: Presented): void;
  /// A menu's actions in the sheet.
  menu(title: string | undefined, entries: MenuEntry[]): void;
  /// Asks before something that can't be taken back.
  confirm(confirmation: Confirmation): void;
}

const HostContext = createContext<SheetPresenter | null>(null);

export const useOptionalSheetHost = () => useContext(HostContext);

/// Holds the sheet opened from code, over the whole app.
export function SheetHost({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Presented | null>(null);
  const [open, setOpen] = useState(false);
  const present = useCallback((sheet: Presented) => {
    setShown(sheet);
    setOpen(true);
  }, []);
  const presenter = useMemo<SheetPresenter>(
    () => ({
      present,
      menu: (title, entries) => present({ title, content: <MenuList entries={entries} /> }),
      confirm: (confirmation) =>
        present({
          title: confirmation.title,
          content: <ConfirmContent confirmation={confirmation} />,
        }),
    }),
    [present],
  );
  return (
    <HostContext.Provider value={presenter}>
      {children}
      {shown ? (
        <Sheet open={open} onOpenChange={setOpen} title={shown.title} size={shown.size}>
          {shown.content}
        </Sheet>
      ) : null}
    </HostContext.Provider>
  );
}
