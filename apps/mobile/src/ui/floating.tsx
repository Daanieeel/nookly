import {
  type ReactNode,
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { StyleSheet, View } from "react-native";

/// What floats over a page (the save bar): drawn by the page's `Screen` above its scrolling
/// content, so it stays put while the page scrolls, though it is declared deep inside it.
class FloatingStore {
  private nodes = new Map<string, ReactNode>();
  private listeners = new Set<() => void>();
  private shown: ReactNode[] = [];

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  snapshot = () => this.shown;

  put(id: string, node: ReactNode | null) {
    if (node === null) this.nodes.delete(id);
    else this.nodes.set(id, node);
    this.shown = [...this.nodes.values()];
    for (const listener of this.listeners) listener();
  }
}

const FloatingContext = createContext<FloatingStore | null>(null);

/// The page's layer for what floats over it; `Screen` puts it after its scrolling content.
export function FloatingLayer({ children }: { children: ReactNode }) {
  const [store] = useState(() => new FloatingStore());
  const shown = useSyncExternalStore(store.subscribe, store.snapshot);
  return (
    <FloatingContext.Provider value={store}>
      {children}
      {shown.length > 0 ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {shown}
        </View>
      ) : null}
    </FloatingContext.Provider>
  );
}

/// Draws its children in the page's floating layer instead of where it stands; outside a
/// page (a sheet, a test of one part) it draws them in place.
export function Floating({ children }: { children: ReactNode }) {
  const store = useContext(FloatingContext);
  const id = useId();
  useLayoutEffect(() => {
    store?.put(id, children);
  });
  useLayoutEffect(() => () => store?.put(id, null), [store, id]);
  return store ? null : children;
}
