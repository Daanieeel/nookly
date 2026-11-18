import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/// Whether the system's Reduce Motion is on, kept current while the setting changes. Motion
/// that only decorates stands still while it is.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduce(on));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
