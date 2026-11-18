import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { View } from "react-native";
import { SPACE } from "../tokens.ts";

/// What a step pins above its list (a search field, the section scrolled to), so it stays
/// put while the list scrolls under it.
export interface PinStore {
  get(): ReactNode;
  set(node: ReactNode): void;
  subscribe(listener: () => void): () => void;
}

export function makePinStore(): PinStore {
  let current: ReactNode = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next) => {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export function PinnedSlot({ store, inset = SPACE.lg }: { store: PinStore; inset?: number }) {
  const node = useSyncExternalStore(store.subscribe, store.get);
  return node ? (
    <View style={{ paddingHorizontal: inset, paddingBottom: SPACE.sm }}>{node}</View>
  ) : null;
}
