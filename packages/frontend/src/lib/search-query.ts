import { foldText } from "#/lib/text-search.ts";

/// A filter chip of the search palettes: `in:Study` narrows to a Space, `#Urgent` to a label.
export type SearchChip =
  | { kind: "space"; spaceId: string; name: string }
  | { kind: "label"; name: string };

export function chipText(chip: SearchChip): string {
  return chip.kind === "space" ? `in:${chip.name}` : `#${chip.name}`;
}

/// The filter being typed at the end of the input, if any: `in:Stu` or `#urg`. The
/// `before` text is what stays in the input once a suggestion is picked.
export interface PendingFilter {
  kind: "space" | "label";
  /// What follows the `in:` or `#` so far.
  partial: string;
  before: string;
}

const PENDING = /(^|\s)(in:|#)([^\n]*)$/iu;

export function pendingFilter(input: string): PendingFilter | null {
  const match = PENDING.exec(input);
  if (!match) return null;
  const [whole, lead, marker, partial] = match;
  return {
    kind: marker === "#" ? "label" : "space",
    partial,
    before: input.slice(0, input.length - whole.length + lead.length),
  };
}

/// The names that start with `partial`, then those that contain it, ignoring case and
/// accents. An empty `partial` lists them all.
export function suggestNames<T extends { name: string }>(items: T[], partial: string): T[] {
  const needle = foldText(partial.trim());
  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const name = foldText(item.name);
    if (name.startsWith(needle)) starts.push(item);
    else if (name.includes(needle)) contains.push(item);
  }
  return [...starts, ...contains];
}

/// Turns `in:Study ` or `#urgent ` (a finished word followed by a space) into a chip
/// when its name matches a Space or label exactly. Returns the input without that
/// word and the chip, or `null` when nothing was finished.
export function finishedFilter(
  input: string,
  spaces: { id: string; name: string }[],
  labels: { name: string }[],
): { text: string; chip: SearchChip } | null {
  const match = /(^|\s)(in:|#)(\S+)\s$/iu.exec(input);
  if (!match) return null;
  const [whole, lead, marker, word] = match;
  const wanted = foldText(word);
  const text = input.slice(0, input.length - whole.length) + lead;
  if (marker === "#") {
    const label = labels.find((l) => foldText(l.name) === wanted);
    return label ? { text, chip: { kind: "label", name: label.name } } : null;
  }
  const space = spaces.find((s) => foldText(s.name) === wanted);
  return space ? { text, chip: { kind: "space", spaceId: space.id, name: space.name } } : null;
}

/// Adds a chip, replacing the Space chip when it is another Space, and dropping
/// a label chip already there.
export function withChip(chips: SearchChip[], chip: SearchChip): SearchChip[] {
  if (chip.kind === "space") return [...chips.filter((c) => c.kind !== "space"), chip];
  const same = chips.some((c) => c.kind === "label" && foldText(c.name) === foldText(chip.name));
  return same ? chips : [...chips, chip];
}
