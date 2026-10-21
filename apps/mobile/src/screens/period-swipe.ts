import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/// How far a finger has to travel, or how fast it has to flick, for a swipe to move on.
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 500;
const SLIDE_MS = 200;
const SETTLE_MS = 150;

/// A swipe over a calendar page that carries the pages with the finger: the one shown and
/// the ones either side, already drawn, slide together. Let go far enough and they slide on
/// until the next (or the one before) is in place, `step` moves the view on so that page is
/// the one shown, and the strip jumps back to the middle without a visible change; not
/// far enough and they slide back.
///
/// `shown` is whatever names the page on screen (its first day): it changing is how the new
/// page is known to be in place. `width` is one page's.
export function usePeriodSwipe(step: (direction: 1 | -1) => void, shown: string, width: number) {
  const offset = useSharedValue(0);
  // The gesture is built once, so it asks for the current `step` when it needs it.
  const latestStep = useRef(step);
  latestStep.current = step;
  const commit = useCallback((direction: 1 | -1) => latestStep.current(direction), []);
  // The page that slid in is now the one shown, in the middle: back to rest.
  useLayoutEffect(() => {
    offset.value = 0;
  }, [shown, offset]);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId("calendar-swipe")
        .activeOffsetX([-24, 24])
        .failOffsetY([-12, 12])
        .onUpdate((event) => {
          offset.value = event.translationX;
        })
        .onEnd((event) => {
          const left = event.translationX <= -SWIPE_DISTANCE || event.velocityX < -SWIPE_VELOCITY;
          const right = event.translationX >= SWIPE_DISTANCE || event.velocityX > SWIPE_VELOCITY;
          if (!left && !right) {
            offset.value = withTiming(0, { duration: SETTLE_MS });
            return;
          }
          // Left brings the next page, right the one before.
          const direction = left ? 1 : -1;
          offset.value = withTiming(
            -direction * width,
            { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) },
            (finished) => {
              if (finished) runOnJS(commit)(direction);
            },
          );
        })
        .onFinalize((_event, success) => {
          if (!success) offset.value = withTiming(0, { duration: SETTLE_MS });
        }),
    [offset, width, commit],
  );
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return { gesture, style };
}
