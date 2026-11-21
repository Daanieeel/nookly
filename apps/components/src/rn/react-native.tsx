import "./layer-rnw";
// The phone's `react-native` on the web: react-native-web, with its primitives taking a
// `className` the way NativeWind gives them one on the phone. A class goes through
// react-native-web's `$$css`, which sets it on the element as a plain class, so Tailwind
// does the styling and nothing here knows a color or a size.
import { type ComponentType, createElement, forwardRef, useSyncExternalStore } from "react";
import {
  ActivityIndicator as RNActivityIndicator,
  FlatList as RNFlatList,
  Image as RNImage,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  StyleSheet,
  Switch as RNSwitch,
  Text as RNText,
  TextInput as RNTextInput,
  View as RNView,
} from "react-native-web";

export * from "react-native-web";

type WithClass = { className?: string; style?: unknown };

/// The phone loads Inter one face per weight (`Inter_500Medium`); the page has Inter as one
/// variable font, so a face's name becomes the family and the weight it stands for.
const FACE = /^Inter(?:Tight)?_(\d{3})/;

function fixFont(style: unknown): unknown {
  const flat = StyleSheet.flatten(style as object) as { fontFamily?: string } | undefined;
  const face = flat?.fontFamily ? FACE.exec(flat.fontFamily) : null;
  if (!flat || !face) return style;
  const tight = flat.fontFamily?.startsWith("InterTight");
  return {
    ...flat,
    fontFamily: tight
      ? "Inter Tight Variable, Inter Variable, sans-serif"
      : "Inter Variable, sans-serif",
    fontWeight: face[1],
  };
}

function withClassName<P extends object>(Component: ComponentType<P>, text = false) {
  const Styled = forwardRef<unknown, P & WithClass>(function Styled(props, ref) {
    const { className, style: given, ...rest } = props;
    const style = text ? fixFont(given) : given;
    const merged = className ? [{ $$css: true, className }, style] : style;
    return createElement(Component as ComponentType<object>, { ...rest, ref, style: merged });
  });
  Styled.displayName = Component.displayName ?? Component.name;
  return Styled;
}

export const View = withClassName(RNView);
export const Text = withClassName(RNText, true);
export const Pressable = withClassName(RNPressable);
export const ScrollView = withClassName(RNScrollView);
export const TextInput = withClassName(RNTextInput, true);
export const Image = withClassName(RNImage);
export const Switch = withClassName(RNSwitch);
export const ActivityIndicator = withClassName(RNActivityIndicator);
export const FlatList = withClassName(RNFlatList);
export const KeyboardAvoidingView = withClassName(RNKeyboardAvoidingView);

// iOS's system colors exist on the phone only; the phone's own code asks for them on iOS.
export const PlatformColor = (...names: string[]) => names[0] ?? "";
export const DynamicColorIOS = (colors: { light: string; dark: string }) => colors.light;

// The scheme is the gallery's own theme switch (the `dark` class), not the system's.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const current = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");

export function useColorScheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, current, () => "light");
}

export const Appearance = {
  getColorScheme: current,
  setColorScheme() {},
  addChangeListener(listener: (preferences: { colorScheme: "light" | "dark" }) => void) {
    const observer = new MutationObserver(() => listener({ colorScheme: current() }));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return { remove: () => observer.disconnect() };
  },
};
