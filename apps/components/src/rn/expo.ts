// The Expo modules the phone calls into, none of which exist in a browser. Each one is
// "not there", which is how the phone's own code already treats a build without it.
export function requireOptionalNativeModule() {
  return null;
}
export function requireNativeModule(): never {
  throw new Error("No native modules in the browser");
}
export function requireNativeView() {
  return () => null;
}
export function registerRootComponent() {}
