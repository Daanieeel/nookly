import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { ignoreError } from "#/lib/log.ts";

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
        .catch(ignoreError("following fullscreen changes"));
    };
    sync();
    const unlisten = win.onResized(sync);
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn()).catch(ignoreError("following fullscreen changes"));
    };
  }, []);

  return fullscreen;
}
