import { type WindowClass, useWindowClass } from "../pane.tsx";

/// How the one sheet shows (D83): on a phone a sheet from the bottom or a floating card
/// (D65), as screens ask; on a tablet a popover anchored to what opened it, or a centred
/// dialog, chosen here from what is shown and never by the screen.
export type SheetPresentation = "sheet" | "card" | "popover" | "dialog";

/// What is shown, which decides how it shows on a tablet:
/// `picker` a select or picker (date, status, Space, icon), `menu` a button's actions,
/// `context` a long press menu, `form` a create form, `confirm` a confirmation, `flow` a
/// big flow (Settings, Review Changes), `focus` a full window session.
export type PresentationKind =
  | "picker"
  | "menu"
  | "context"
  | "form"
  | "confirm"
  | "flow"
  | "focus";

/// A dialog's widths, the desktop's: small, medium, large and extra large.
export const DIALOG_WIDTH = { small: 420, medium: 560, large: 720, xlarge: 960 } as const;
export type DialogSize = keyof typeof DIALOG_WIDTH;

/// A popover's widths: lists and the calendar, the icon grid and filters.
export const POPOVER_WIDTH = { list: 320, wide: 360 } as const;

export interface Resolved {
  presentation: SheetPresentation;
  /// A dialog's size; for anything else, unused.
  dialog: DialogSize;
}

const DIALOG_OF = {
  picker: "small",
  menu: "small",
  context: "small",
  confirm: "small",
  form: "medium",
  flow: "large",
  focus: "xlarge",
} satisfies Record<PresentationKind, DialogSize>;

/// How something shows in a window of `windowClass`. A phone keeps what the screen asked
/// for (`requested`, a sheet by default); a tablet shows pickers and menus as popovers on
/// their anchor (a dialog when nothing anchors them) and everything else as a dialog.
export function resolvePresentation({
  windowClass,
  kind,
  anchored,
  touched = false,
  requested,
  large,
}: {
  windowClass: WindowClass;
  kind?: PresentationKind;
  /// Something names what opened it (`useAnchor`, a point).
  anchored: boolean;
  /// Nothing names it, but a finger just went down (`recentTouch`): a menu or picker
  /// still opens there.
  touched?: boolean;
  requested?: SheetPresentation;
  /// A tall sheet (`size="large"`) on a phone: a large dialog when nothing says otherwise.
  large?: boolean;
}): Resolved {
  // A phone's card is a picker (D65); a tall sheet a flow.
  const fallback = kind ?? (large ? "flow" : anchored || requested === "card" ? "picker" : "form");
  const dialog = DIALOG_OF[fallback];
  if (windowClass === "compact") return { presentation: requested ?? "sheet", dialog };
  const floats = fallback === "picker" || fallback === "menu" || fallback === "context";
  return { presentation: floats && (anchored || touched) ? "popover" : "dialog", dialog };
}

export function usePresentation(
  options: Omit<Parameters<typeof resolvePresentation>[0], "windowClass">,
) {
  return resolvePresentation({ ...options, windowClass: useWindowClass() });
}
