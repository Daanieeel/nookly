import type { Confirmation, MenuEntry, MenuItem, MenuPresenter } from "../ui/menu.tsx";

/// A menu that shows nothing and remembers what it was asked to show (a menu or a
/// confirmation), so a test can read the actions offered and choose one.
export class RecordingMenu implements MenuPresenter {
  private shown: MenuItem[] = [];
  /// The title of the confirmation asked last.
  asked: string | null = null;

  show(_title: string | undefined, entries: MenuEntry[]) {
    this.asked = null;
    this.shown = entries.flatMap((entry) => (entry === "separator" ? [] : [entry]));
  }

  confirm(confirmation: Confirmation) {
    this.asked = confirmation.title;
    this.shown = confirmation.actions;
  }

  /// The labels of the menu shown last.
  labels(): string[] {
    return this.shown.map((item) => item.label);
  }

  /// Chooses an action of the menu shown last.
  choose(label: string) {
    const item = this.shown.find((i) => i.label === label);
    if (!item) throw new Error(`The menu has no "${label}": ${this.labels().join(", ")}`);
    item.onPress?.();
  }
}

/// A clipboard that keeps what was copied.
export class RecordingClipboard {
  copied: string[] = [];

  async copy(text: string) {
    this.copied.push(text);
  }
}

/// A file picker that always picks the same text (or backs out, with null).
export class FixedFilePicker {
  readonly text: string | null;

  constructor(text: string | null) {
    this.text = text;
  }

  async pickText() {
    return this.text;
  }
}
