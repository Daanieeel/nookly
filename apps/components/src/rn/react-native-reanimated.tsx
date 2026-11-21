// Reanimated for a page that shows components standing still: a shared value is a plain
// box, an animated style is worked out when the component renders, and an animation
// jumps to where it ends. Nothing here moves, which is all a gallery needs.
import { type ComponentType, Fragment, type ReactNode, useMemo, useReducer, useRef } from "react";
import { ScrollView, Text, View } from "./react-native";

export interface SharedValue<T> {
  value: T;
}

/// A shared value draws again when it is set, which is as much of an animation as a page of
/// still components needs: what is set shows at once, where the phone would glide to it.
export function useSharedValue<T>(initial: T): SharedValue<T> {
  const [, draw] = useReducer((n: number) => n + 1, 0);
  const box = useRef<{ held: T; shared: SharedValue<T> } | null>(null);
  if (!box.current) {
    const state = { held: initial } as { held: T; shared: SharedValue<T> };
    state.shared = {
      get value() {
        return state.held;
      },
      set value(next: T) {
        if (Object.is(next, state.held)) return;
        state.held = next;
        draw();
      },
    };
    box.current = state;
  }
  return box.current.shared;
}

export function useAnimatedStyle<T>(updater: () => T): T {
  return updater();
}

export function useDerivedValue<T>(compute: () => T): SharedValue<T> {
  return { value: compute() };
}

const target = <T,>(value: T): T => value;
export const withSpring = target;
export const withTiming = target;
export const withDelay = (_delay: number, value: unknown) => value;
export const withRepeat = target;
export const withSequence = (...values: unknown[]) => values.at(-1);
export const cancelAnimation = () => {};
export const runOnJS = <F,>(fn: F) => fn;
export const runOnUI = <F,>(fn: F) => fn;
export const useAnimatedReaction = () => {};
export const useAnimatedScrollHandler = () => () => {};
export const useScrollOffset = () => ({ value: 0 });
export const useAnimatedKeyboard = () => ({ height: { value: 0 }, state: { value: 0 } });
export const useReducedMotion = () => false;
export const useAnimatedRef = () => useRef(null);

export function interpolate(value: number, input: number[], output: number[]) {
  const first = input[0] ?? 0;
  const last = input.at(-1) ?? 1;
  const t = Math.min(1, Math.max(0, (value - first) / (last - first || 1)));
  return (output[0] ?? 0) + t * ((output.at(-1) ?? 0) - (output[0] ?? 0));
}

export const Easing = new Proxy({} as Record<string, unknown>, {
  get:
    () =>
    (...args: unknown[]) =>
      args.length ? new Proxy({}, { get: () => () => 0 }) : 0,
});

const entering = { duration: () => entering, delay: () => entering, springify: () => entering };
export const FadeIn = entering;
export const FadeOut = entering;
export const LinearTransition = entering;
export const Layout = entering;

export function LayoutAnimationConfig({ children }: { children?: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

function createAnimatedComponent<P extends object>(Component: ComponentType<P>) {
  return Component;
}

const Animated = {
  View,
  Text,
  ScrollView,
  createAnimatedComponent,
  useSharedValue,
  useAnimatedStyle,
};

export type AnimatedStyle<T = unknown> = T;
export const useMemoShim = useMemo;
export default Animated;
