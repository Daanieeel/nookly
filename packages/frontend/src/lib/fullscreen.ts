import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

/// Whether the window is fullscreen. macOS hides the traffic lights then, so
/// the titlebar stops reserving room for them.
export function useIsFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let cancelled = false;
    const sync = () => {
      win
        .isFullscreen()
        .then((value) => {
          if (!cancelled) setFullscreen(value);
        })
        .catch(() => {});
    };
    sync();
    const unlisten = win.onResized(sync);
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  return fullscreen;
}
