import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { SpaceName } from "./space-name.tsx";

describe("a Space's name in the sidebar", () => {
  it("says when someone shared the Space's items with you", () => {
    renderWithProviders(<SpaceName space={{ id: "shared-u1", name: "Ada's items" }} />);
    expect(screen.getByText("Ada's items")).toBeInTheDocument();
    expect(screen.getByText("Shared with you")).toBeInTheDocument();
  });

  it("shows only the name of your own Space", () => {
    renderWithProviders(<SpaceName space={{ id: "s1", name: "Work" }} />);
    expect(screen.queryByText("Shared with you")).toBeNull();
  });
});
