import type { ActiveFilter } from "#/components/filter-menu.tsx";

/// A View that ships with the app. Picking one saves it as the user's own View, so
/// from then on it can be edited, renamed or deleted like any other.
export interface ViewPreset<D> {
  name: string;
  description: string;
  /// A key of `ICON_LIBRARY`, saved as the View's icon.
  icon: string;
  /// Tints the icon, `#rrggbb`.
  color: string;
  filters: ActiveFilter[];
  display: D;
}

/// How a preset's display reads in its preview.
export interface DisplaySummary {
  layout: "list" | "board";
  /// Null without a grouping.
  grouping: string | null;
  ordering: string;
}

export function is(fieldId: string, ...values: string[]): ActiveFilter {
  return { fieldId, operator: "is", values };
}

export function isNot(fieldId: string, ...values: string[]): ActiveFilter {
  return { fieldId, operator: "isNot", values };
}
