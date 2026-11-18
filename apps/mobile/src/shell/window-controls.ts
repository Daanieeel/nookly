import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { windowControlsInset } from "../../modules/nookly-window/src/index.ts";
import { useWindowSize } from "../ui/pane.tsx";

/// Where iPadOS 26 draws a window's close, minimise and resize controls (0.4): the room
/// they take at the top left, zero while the app fills the screen. Read again whenever the
/// window changes size or the app comes back.
export function useWindowControlsInset() {
  const { width, height } = useWindowSize();
  const [inset, setInset] = useState(windowControlsInset);
  useEffect(() => {
    setInset(windowControlsInset());
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setInset(windowControlsInset());
    });
    return () => sub.remove();
  }, [width, height]);
  return inset;
}
