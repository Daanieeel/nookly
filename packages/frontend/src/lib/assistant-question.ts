const QUESTION_STARTS =
  /^(what|who|when|where|why|how|is|are|can|does|do|did|should|will|would|could|which)\b/i;

/// Whether a Cmd+K query reads like a question worth an "Ask Assistant" row
/// (PLAN §6.3), rather than an entity/keyword search. Deliberately simple: a
/// trailing "?" or a leading question word, nothing smarter.
export function looksLikeAQuestion(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length < 3) return false;
  return trimmed.endsWith("?") || QUESTION_STARTS.test(trimmed);
}
