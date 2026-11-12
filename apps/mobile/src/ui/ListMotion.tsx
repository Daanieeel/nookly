import { Fragment, type ReactNode } from "react";
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
} from "react-native-reanimated";
import { FADE, SPRING } from "./motion.ts";
import { useReduceMotion } from "./reduce-motion.ts";

/// The list moves as iOS's do: a row that comes or goes fades, and the rows around it
/// slide into place on a spring instead of jumping. Under Reduce Motion, only the fade.
const SLIDE = LinearTransition.springify().duration(SPRING.press.duration).dampingRatio(1);

export function ListItem({ children }: { children: ReactNode }) {
  const still = useReduceMotion();
  return (
    <Animated.View
      layout={still ? undefined : SLIDE}
      entering={FadeIn.duration(FADE.in)}
      exiting={FadeOut.duration(FADE.out)}
    >
      {children}
    </Animated.View>
  );
}

/// Around a list of `ListItem`s: the rows there when it opens just show; only later ones
/// fade in.
export function ListGroup({ children }: { children: ReactNode }) {
  // Reanimated's test stand in has no `LayoutAnimationConfig`; nothing animates there anyway.
  if (!LayoutAnimationConfig) return <Fragment>{children}</Fragment>;
  return <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>;
}
