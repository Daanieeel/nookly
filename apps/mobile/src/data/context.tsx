import type { LocalDb } from "@nookly/shared/data";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useContext } from "react";
import { useStore } from "zustand";
import type { SyncAccountState } from "@nookly/shared/sync";
import { keys } from "./keys.ts";
import type { MobileSync } from "./sync.ts";

/// A small device preference.
export interface Preference {
  get(): string | null;
  set(value: string): void;
}

export interface AppData {
  db: LocalDb;
  sync: MobileSync;
  /// The sync server's address.
  serverUrl: Preference;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ value, children }: { value: AppData; children: ReactNode }) {
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData outside AppDataProvider");
  return value;
}

export function useDb(): LocalDb {
  return useAppData().db;
}

export function useSyncState<T>(selector: (state: SyncAccountState) => T): T {
  return useStore(useAppData().sync.store, selector);
}

/// After a local write: every view refreshes, and sync sends it shortly.
function afterLocalWrite(queryClient: QueryClient, sync: MobileSync) {
  void queryClient.invalidateQueries({ queryKey: keys.local });
  sync.notifyLocalChange();
}

/// A write to the phone's data, as a mutation: views refresh and sync is told.
export function useLocalWrite<TInput, TResult>(
  write: (db: LocalDb, input: TInput) => Promise<TResult>,
) {
  const { db, sync } = useAppData();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => write(db, input),
    onSuccess: () => afterLocalWrite(queryClient, sync),
  });
}
