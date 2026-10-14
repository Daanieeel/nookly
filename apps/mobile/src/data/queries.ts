import {
  agenda,
  getEntity,
  getTask,
  listBlocks,
  listBookmarks,
  listEntities,
  listSpaces,
  listStatuses,
  listTasks,
  pinned,
  recents,
  search,
  spaceModules,
} from "@nookly/shared/data";
import { useQuery } from "@tanstack/react-query";
import { useDb } from "./context.tsx";
import { keys } from "./keys.ts";

/// Reads of the phone's data. Every one sits under `keys.local`, refreshed on each
/// local write and on every sync that brought changes.

export const useSpaces = () => {
  const db = useDb();
  return useQuery({ queryKey: keys.spaces, queryFn: () => listSpaces(db) });
};

export const useSpaceModules = (spaceId: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.modules(spaceId), queryFn: () => spaceModules(db, spaceId) });
};

export const useEntities = (spaceId: string | null, types: string[], trash = false) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.entities(spaceId, types, trash),
    queryFn: () => listEntities(db, { spaceId: spaceId ?? undefined, types, trash }),
  });
};

export const useEntity = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.entity(id), queryFn: () => getEntity(db, id) });
};

export const useTasks = (spaceId: string | null) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.tasks(spaceId),
    queryFn: () => listTasks(db, spaceId ?? undefined),
  });
};

export const useTask = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.task(id), queryFn: () => getTask(db, id) });
};

export const useStatuses = () => {
  const db = useDb();
  return useQuery({
    queryKey: keys.statuses,
    queryFn: () => listStatuses(db),
    staleTime: Infinity,
  });
};

export const useBlocks = (entityId: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.blocks(entityId), queryFn: () => listBlocks(db, entityId) });
};

export const useAgenda = (from: string, to: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.agenda(from, to), queryFn: () => agenda(db, from, to) });
};

export const useBookmarks = (spaceId: string | null) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.bookmarks(spaceId),
    queryFn: () => listBookmarks(db, spaceId ?? undefined),
  });
};

export const useSearch = (query: string) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.search(query),
    queryFn: () => search(db, query),
    enabled: query.trim().length > 0,
  });
};

export const useRecents = () => {
  const db = useDb();
  return useQuery({ queryKey: keys.recents, queryFn: () => recents(db) });
};

export const usePinned = () => {
  const db = useDb();
  return useQuery({ queryKey: keys.pinned, queryFn: () => pinned(db) });
};
