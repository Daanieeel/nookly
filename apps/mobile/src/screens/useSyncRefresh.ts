import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";

/// Pull to refresh: syncs when signed in, and reloads what is on screen either way.
export function useSyncRefresh() {
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    void sync
      .syncNow()
      .catch(() => {})
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: keys.local });
        setRefreshing(false);
      });
  };
  return { refreshing, onRefresh };
}
