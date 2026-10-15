import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { CardWriter } from "./CardWriter.tsx";

describe("CardWriter preview", () => {
  it("draws a formula as it is typed, and only when there is something to draw", async () => {
    const { user } = renderWithProviders(
      <CardWriter deckId="d-preview" count={0} onDone={() => {}} />,
    );
    expect(screen.queryByRole("region", { name: "Preview" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Card front" }), "Area: $\\pi r^2$");
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(preview.querySelector(".katex")).not.toBeNull();
  });

  it("shows no preview for plain text", async () => {
    const { user } = renderWithProviders(
      <CardWriter deckId="d-plain" count={0} onDone={() => {}} />,
    );
    await user.type(screen.getByRole("textbox", { name: "Card front" }), "Capital of France");
    expect(screen.queryByRole("region", { name: "Preview" })).not.toBeInTheDocument();
  });
});
