import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/// A word of a text block, and where it sits in it: `from` and `to` count from the start of the
/// block's content, so the position in the document is the block's start plus these.
export interface WordSpan {
  word: string;
  from: number;
  to: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

/// Text that is not prose, whatever mark it is under: code and links (a mention is a link).
function isLeftOut(node: ProseMirrorNode): boolean {
  return node.marks.some((mark) => mark.type.name === "code" || mark.type.name === "link");
}

/// A chunk (the text between spaces) that is an address or a path, none of whose words are
/// spelled.
const ADDRESS = /[@/\\]|:\/\/|^www\./i;

/// Whether a word is worth checking: it has letters only, is at least two long, and is not an
/// acronym written in capitals.
function isCheckable(word: string): boolean {
  if (word.length < 2 || /[\d_]/.test(word)) return false;
  return word !== word.toUpperCase() || word === word.toLowerCase();
}

/// The words of a text block that are worth checking. Code and links are left out, and so is
/// everything that is not text (a formula breaks a word in two, it is not part of one).
export function wordsIn(block: ProseMirrorNode): WordSpan[] {
  if (block.type.spec.code || !block.isTextblock) return [];
  // Text and where it starts, with a space where something else sits, so words never run
  // together across it.
  let flat = "";
  const skipped: boolean[] = [];
  block.forEach((child) => {
    const left = child.isText ? isLeftOut(child) : true;
    const piece = child.isText ? (child.text ?? "") : " ";
    for (let i = 0; i < piece.length; i++) {
      skipped.push(left);
    }
    flat += piece;
  });

  const found: WordSpan[] = [];
  for (const part of segmenter.segment(flat)) {
    if (!part.isWordLike || !isCheckable(part.segment)) continue;
    const from = part.index;
    const to = from + part.segment.length;
    if (skipped.slice(from, to).some(Boolean)) continue;
    // The chunk between spaces the word is in.
    let begin = from;
    while (begin > 0 && !/\s/.test(flat[begin - 1])) begin--;
    let end = to;
    while (end < flat.length && !/\s/.test(flat[end])) end++;
    if (ADDRESS.test(flat.slice(begin, end))) continue;
    found.push({ word: part.segment, from, to });
  }
  return found;
}
