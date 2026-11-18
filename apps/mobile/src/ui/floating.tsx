import {
  Fragment,
  type ReactNode,
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { StyleSheet, View } from "react-native";

/// What a page draws away from where it is declared (the save bar over the page, a list's
/// top above it), kept by id in the order it first came, for its `Screen` to draw.
export class SlotStore {
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
    this.shown = [...this.nodes].map(([key, value]) => <Fragment key={key}>{value}</Fragment>);
    for (const listener of this.listeners) listener();
  }
}

/// A slot's store and what it holds now.
export function useSlotStore() {
  const [store] = useState(() => new SlotStore());
  const shown = useSyncExternalStore(store.subscribe, store.snapshot);
  return { store, shown };
}

/// Hands `children` to the slot's store instead of drawing them; with no store (a sheet, a
/// test of one part) they are drawn in place.
export function useSlot(store: SlotStore | null, children: ReactNode): ReactNode {
  const id = useId();
  useLayoutEffect(() => {
    store?.put(id, children);
  });
  useLayoutEffect(() => () => store?.put(id, null), [store, id]);
  return store ? null : children;
}

const FloatingContext = createContext<SlotStore | null>(null);

/// The page's layer for what floats over it; `Screen` puts it after its scrolling content.
export function FloatingLayer({ children }: { children: ReactNode }) {
  const { store, shown } = useSlotStore();
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
  return useSlot(useContext(FloatingContext), children);
}
