/// What the phone's JavaScript engine (Hermes) lacks of the language the shared code is
/// written in: the copying array methods (ES2023), and `Intl.DisplayNames`. Each is added only where missing, not
/// enumerable, and behaves as the standard says. Imported first, before any other module.

const methods = {
  toSorted<T>(this: T[], compare?: (a: T, b: T) => number): T[] {
    return this.slice().sort(compare);
  },
  toReversed<T>(this: T[]): T[] {
    return this.slice().reverse();
  },
  toSpliced<T>(this: T[], start: number, deleteCount?: number, ...items: T[]): T[] {
    const copy = this.slice();
    if (deleteCount === undefined) copy.splice(start);
    else copy.splice(start, deleteCount, ...items);
    return copy;
  },
  with<T>(this: T[], index: number, value: T): T[] {
    const at = index < 0 ? this.length + index : index;
    if (!Number.isInteger(at) || at < 0 || at >= this.length) {
      throw new RangeError("Invalid index");
    }
    const copy = this.slice();
    copy[at] = value;
    return copy;
  },
};

for (const [name, value] of Object.entries(methods)) {
  if (name in Array.prototype) continue;
  Object.defineProperty(Array.prototype, name, {
    value,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// The desktop's time zone table (`timezone-countries.ts`) builds region names when it is
// loaded. Without them a zone simply shows no country name, as the standard's
// `fallback: "none"` does for a code it cannot name.
if (!("DisplayNames" in Intl)) {
  Object.defineProperty(Intl, "DisplayNames", {
    value: class DisplayNames {
      of(_code: string): string | undefined {
        return undefined;
      }
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

export {};
