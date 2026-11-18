/// The text side of Vim motions: pure functions on a line of text and a position in it,
/// with no editor in sight. `￼` stands for an inline node (a formula, a mention) and
/// counts as punctuation.

type Kind = "word" | "space" | "other";

function kindOf(char: string): Kind {
  if (/\s/.test(char)) return "space";
  return /[\p{L}\p{N}_]/u.test(char) ? "word" : "other";
}

/// The end of the run of the same kind that starts at `from`.
function runEnd(text: string, from: number): number {
  const kind = kindOf(text.charAt(from));
  let i = from;
  while (i < text.length && kindOf(text.charAt(i)) === kind) i++;
  return i;
}

/// `w`: the start of the next word. A run of punctuation is a word of its own. The end of
/// the text when there is none.
export function nextWordStart(text: string, from: number): number {
  if (from >= text.length) return text.length;
  let i = kindOf(text.charAt(from)) === "space" ? from : runEnd(text, from);
  while (i < text.length && kindOf(text.charAt(i)) === "space") i++;
  return i;
}

/// `b`: the start of the word before the cursor, or of the one it is in.
export function prevWordStart(text: string, from: number): number {
  let i = Math.min(from, text.length) - 1;
  while (i >= 0 && kindOf(text.charAt(i)) === "space") i--;
  if (i < 0) return 0;
  const kind = kindOf(text.charAt(i));
  while (i > 0 && kindOf(text.charAt(i - 1)) === kind) i--;
  return i;
}

/// `e`: the last character of the current word, or of the next one when already on it.
export function wordEnd(text: string, from: number): number {
  const last = Math.max(0, text.length - 1);
  let i = from + 1;
  while (i < text.length && kindOf(text.charAt(i)) === "space") i++;
  if (i >= text.length) return last;
  return runEnd(text, i) - 1;
}

/// `^`: the first character that is not a space; the last one on a line of spaces.
export function firstNonBlank(text: string): number {
  const i = text.search(/\S/);
  return i === -1 ? Math.max(0, text.length - 1) : i;
}

/// `iw` and `aw`: the run under the cursor as `[from, to)`. `aw` takes the spaces after
/// the word too, or the ones before it when the word is the last on its line.
export function wordObject(text: string, at: number, around: boolean): [number, number] {
  if (text.length === 0) return [0, 0];
  const i = Math.min(at, text.length - 1);
  const kind = kindOf(text.charAt(i));
  let from = i;
  while (from > 0 && kindOf(text.charAt(from - 1)) === kind) from--;
  let to = runEnd(text, i);
  if (!around || kind === "space") return [from, to];
  const after = to;
  while (to < text.length && kindOf(text.charAt(to)) === "space") to++;
  if (to > after) return [from, to];
  while (from > 0 && kindOf(text.charAt(from - 1)) === "space") from--;
  return [from, to];
}
