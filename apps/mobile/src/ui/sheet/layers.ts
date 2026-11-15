import { createContext, useContext, useEffect } from "react";
import { create } from "zustand";

/// The popovers and dialogs open on a tablet, the newest last (D83, 2.1 and 2.2): Escape
/// closes the newest, and Command Return presses its main button, as on the desktop. The
/// keys are only taken from the system while one is open.

export interface Layer {
  id: number;
  close(): void;
  /// Its main button (a create form's Create), when it has one.
  submit?: () => void;
}

export const useLayers = create<{ stack: Layer[] }>(() => ({ stack: [] }));

let ids = 0;

/// Adds a layer; returns how to take it away and to name its main button.
export function pushLayer(close: () => void) {
  const layer: Layer = { id: ++ids, close };
  useLayers.setState((s) => ({ stack: [...s.stack, layer] }));
  return {
    remove: () => useLayers.setState((s) => ({ stack: s.stack.filter((l) => l !== layer) })),
    setSubmit: (submit: (() => void) | undefined) => {
      layer.submit = submit;
    },
  };
}

/// The newest layer.
export const topLayer = (): Layer | undefined => useLayers.getState().stack.at(-1);

export const LayerContext = createContext<ReturnType<typeof pushLayer> | null>(null);

/// Names the main button of the dialog or popover this sits in, for Command Return.
/// Outside one, nothing.
export function useSheetSubmit(submit: (() => void) | undefined) {
  const layer = useContext(LayerContext);
  useEffect(() => {
    layer?.setSubmit(submit);
  });
  useEffect(() => () => layer?.setSubmit(undefined), [layer]);
}
