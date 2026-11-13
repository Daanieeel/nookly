/// What the phone's JavaScript engine (Hermes) lacks of the language the shared code is
/// written in: the copying array methods (ES2023). Each is added only where missing, not
/// enumerable, and behaves as the standard says. Imported first, before any other module.

type Proto = Record<string, unknown>;

function define(name: string, value: (this: unknown[], ...args: never[]) => unknown) {
  if (typeof (Array.prototype as unknown as Proto)[name] === "function") return;
  Object.defineProperty(Array.prototype, name, {
    value,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

define("toSorted", function toSorted(this: unknown[], compare?: (a: never, b: never) => number) {
  return Array.prototype.slice.call(this).sort(compare as never);
});

define("toReversed", function toReversed(this: unknown[]) {
  return Array.prototype.slice.call(this).reverse();
});

define("toSpliced", function toSpliced(this: unknown[], start: never, ...rest: never[]) {
  const copy = Array.prototype.slice.call(this);
  if (rest.length === 0) copy.splice(start);
  else copy.splice(start, rest[0], ...rest.slice(1));
  return copy;
});

define("with", function withAt(this: unknown[], index: never, value: never) {
  const length = this.length;
  const at = Number(index) < 0 ? length + Number(index) : Number(index);
  if (!Number.isInteger(at) || at < 0 || at >= length) throw new RangeError("Invalid index");
  const copy = Array.prototype.slice.call(this);
  copy[at] = value;
  return copy;
});

export {};
