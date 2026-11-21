// What NativeWind gives the phone's code: the value of a token. On the page a token is a CSS
// variable, and a color can be written as the variable itself, so it follows the theme
// without anything watching it.
export function useUnstableNativeVariable(name: string): string {
  return `var(--${name}, var(--color-${name}))`;
}
