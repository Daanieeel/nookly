import type { MenuItem, MenuPresenter } from "../ui/menu.tsx";

/// A menu that shows nothing and remembers what it was asked to show, so a test can read
/// the actions an item offers and choose one.
export class RecordingMenu implements MenuPresenter {
  private shown: MenuItem[] = [];

  show(_title: string | undefined, items: MenuItem[]) {
    this.shown = items;
  }

  /// The labels of the menu shown last.
  labels(): string[] {
    return this.shown.map((item) => item.label);
  }

  /// Chooses an action of the menu shown last.
  choose(label: string) {
    const item = this.shown.find((i) => i.label === label);
    if (!item) throw new Error(`The menu has no "${label}": ${this.labels().join(", ")}`);
    item.onPress();
  }
}
