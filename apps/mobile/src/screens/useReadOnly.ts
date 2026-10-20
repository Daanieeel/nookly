import { isSharedSpace } from "@nookly/shared/api";
import type { EntityRecord } from "@nookly/shared/data";
import { useQuery } from "@tanstack/react-query";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";

/// A page someone shared to view only can't be changed here either.
export function useReadOnly(entity: EntityRecord | null | undefined): boolean {
  const { sync } = useAppData();
  const shared = entity ? isSharedSpace(entity.spaceId) : false;
  const { data: role } = useQuery({
    queryKey: keys.role(entity?.id ?? ""),
    queryFn: () => sync.engine.roleOf(entity?.id ?? ""),
    enabled: shared,
  });
  return role === "viewer" || Boolean(entity?.deletedAt);
}
