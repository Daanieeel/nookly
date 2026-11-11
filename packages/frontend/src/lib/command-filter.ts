import { defaultFilter } from "cmdk";
import { foldText } from "#/lib/text-search.ts";

/// cmdk's own match, run on text made comparable (see `foldText`), so a file named with
/// a decomposed `Ü` is found by typing `Ü` or `u`. Pass it as a `Command`'s `filter`.
export function accentInsensitiveFilter(
  value: string,
  search: string,
  keywords?: string[],
): number {
  return defaultFilter(foldText(value), foldText(search), keywords?.map(foldText));
}
