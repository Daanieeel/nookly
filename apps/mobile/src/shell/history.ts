/// The pages opened so far, so a wide screen can offer back and forward like a browser
/// (the router only knows how to go back). Pages are the router's paths; sheets
/// (`/new/...`, `/pick/...`) are not places to return to and are left out.
export class NavHistory {
  private entries: string[] = [];
  private index = -1;
  /// Set by `back` and `forward`: the router will report the page they lead to, and that
  /// is not a new visit.
  private expected: string | null = null;

  /// The router shows `path` now.
  visit(path: string): void {
    if (/^\/(new|pick)\//.test(path)) return;
    if (this.expected === path) {
      this.expected = null;
      return;
    }
    this.expected = null;
    if (this.entries[this.index] === path) return;
    this.entries = [...this.entries.slice(0, this.index + 1), path];
    this.index = this.entries.length - 1;
  }

  canGoBack(): boolean {
    return this.index > 0;
  }

  canGoForward(): boolean {
    return this.index < this.entries.length - 1;
  }

  /// Steps back; the path to show, or null at the start.
  back(): string | null {
    if (!this.canGoBack()) return null;
    this.index -= 1;
    this.expected = this.entries[this.index] ?? null;
    return this.expected;
  }

  /// Steps forward; the path to show, or null at the end.
  forward(): string | null {
    if (!this.canGoForward()) return null;
    this.index += 1;
    this.expected = this.entries[this.index] ?? null;
    return this.expected;
  }
}

/// The window's one history.
export const history = new NavHistory();
