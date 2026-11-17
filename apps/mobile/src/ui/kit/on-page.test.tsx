import { renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { semantic } from "../tokens.ts";
import { OnPage } from "./on-page.ts";
import { useSurface } from "./scheme.ts";

// Home and Settings sit on the plain page's background, white in light mode. A surface the
// colour of a grouped section (white too) vanished there; on a page it takes a card's tone.
describe("a surface", () => {
  it("is a grouped section's colour by default", () => {
    const { result } = renderHook(() => useSurface());
    expect(result.current).toEqual(semantic("surface", "light"));
  });

  it("takes a card's tone on a plain page", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <OnPage.Provider value>{children}</OnPage.Provider>
    );
    const { result } = renderHook(() => useSurface(), { wrapper });
    expect(result.current).toEqual(semantic("pageCard", "light"));
  });
});
