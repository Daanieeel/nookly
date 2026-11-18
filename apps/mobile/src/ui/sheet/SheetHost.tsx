import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { type Confirmation, ConfirmContent } from "./Confirm.tsx";
import { type MenuEntry, MenuList } from "./MenuList.tsx";
import type { Anchor } from "./anchor.ts";
import type { PresentationKind } from "./presentation.ts";
import { Sheet, type SheetPresentation, type SheetSize } from "./Sheet.tsx";

export interface Presented {
  title?: string;
  size?: SheetSize;
  /// `card`: a dialog in the middle of the screen.
  presentation?: SheetPresentation;
  /// What it is and what opened it: on a tablet a menu is a popover on its anchor.
  kind?: PresentationKind;
  anchor?: Anchor;
  content: ReactNode;
}

/// Opens a sheet from code (a menu from a long press, a confirmation), where no part of a
/// screen holds it. One at a time: a new one takes the place of the one up.
interface SheetPresenter {
  present(sheet: Presented): void;
  /// A menu's actions in the sheet, or in a dialog (`card`).
  menu(
    title: string | undefined,
    entries: MenuEntry[],
    options?: { presentation?: SheetPresentation; anchor?: Anchor; kind?: "menu" | "context" },
  ): void;
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
      menu: (title, entries, options) =>
        present({
          title,
          presentation: options?.presentation,
          kind: options?.kind ?? "menu",
          anchor: options?.anchor,
          content: <MenuList entries={entries} />,
        }),
      confirm: (confirmation) =>
        present({
          title: confirmation.title,
          kind: "confirm",
          content: <ConfirmContent confirmation={confirmation} />,
        }),
    }),
    [present],
  );
  return (
    <HostContext.Provider value={presenter}>
      {children}
      {shown ? (
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title={shown.title}
          size={shown.size}
          presentation={shown.presentation}
          kind={shown.kind}
          anchor={shown.anchor}
        >
          {shown.content}
        </Sheet>
      ) : null}
    </HostContext.Provider>
  );
}
