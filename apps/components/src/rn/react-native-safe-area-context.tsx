// A page in a browser has no notch or home bar to keep clear of.
import type { ComponentProps, ReactNode } from "react";
import { View } from "./react-native";

const NONE = { top: 0, right: 0, bottom: 0, left: 0 };

export const useSafeAreaInsets = () => NONE;
export const useSafeAreaFrame = () => ({ x: 0, y: 0, width: 390, height: 844 });
export const SafeAreaInsetsContext = {
  Consumer: ({ children }: { children: (v: typeof NONE) => ReactNode }) => children(NONE),
};
export function SafeAreaProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function SafeAreaView(props: ComponentProps<typeof View>) {
  return <View {...props} />;
}
