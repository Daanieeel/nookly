import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { search } from "#/lib/api/search.ts";
import { qk } from "#/lib/query-keys.ts";

/// How long typing pauses before the Files page asks the backend.
const DEBOUNCE_MS = 200;
const MAX_HITS = 500;

/// The Files that match the page's search text, by name, content and label, best match
/// first. `ids` is null while the text is empty or the first hits are still on their way,
/// which means every file; the previous hits stay up while newer ones load, so the grid
/// never flashes empty between keystrokes.
export function useFileSearch(spaceId: string, text: string) {
  const query = text.trim();
  const [settled, setSettled] = useState(query);
  useEffect(() => {
    if (query === "") {
      setSettled("");
      return;
    }
    const timer = setTimeout(() => setSettled(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data } = useQuery({
    queryKey: qk.files.search(spaceId, settled),
    queryFn: () => search({ query: settled, spaceId, types: ["file"], limit: MAX_HITS }),
    enabled: settled !== "",
    placeholderData: keepPreviousData,
  });
  if (query === "" || !data) return { ids: null };
  return { ids: data.map((hit) => hit.entityId) };
}
