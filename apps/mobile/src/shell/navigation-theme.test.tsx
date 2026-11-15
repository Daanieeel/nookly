import { renderHook } from "@testing-library/react-native";
import { useNavigationTheme } from "./navigation-theme.ts";

// Every page change rebuilt the navigation's theme, so everything that reads it (every
// screen's container and bar) rendered again on each navigation. It stays the same object
// until the colours change.
describe("the navigation's theme", () => {
  it("is the same object from one render to the next", () => {
    const { result, rerender } = renderHook(() => useNavigationTheme());
    const first = result.current;
    rerender({});
    expect(result.current).toBe(first);
  });
});
