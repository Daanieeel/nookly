/// Sums of named vectors, `a + b - c`, read from the text of a line.

const IDENTIFIER = /[\p{L}_][\p{L}_\d]*/gu;
const TERM = /^([+\-−])?\s*([\p{L}_][\p{L}_\d]*)\s*/u;

/// Whether `body` uses the name of one of `vectors`.
export function mentionsVector(body: string, vectors: ReadonlySet<string>): boolean {
  return (body.match(IDENTIFIER) ?? []).some((name) => vectors.has(name));
}

export interface SumTerm {
  sign: 1 | -1;
  name: string;
}

/// `body` as vectors added and subtracted, `null` when it is anything else.
export function sumTerms(body: string): SumTerm[] | null {
  const terms: SumTerm[] = [];
  let rest = body.trim();
  while (rest) {
    const match = TERM.exec(rest);
    // Only the first vector may go without a sign.
    if (!match?.[2] || (terms.length > 0 && !match[1])) return null;
    terms.push({ sign: match[1] === "-" || match[1] === "−" ? -1 : 1, name: match[2] });
    rest = rest.slice(match[0].length);
  }
  return terms.length > 0 ? terms : null;
}
