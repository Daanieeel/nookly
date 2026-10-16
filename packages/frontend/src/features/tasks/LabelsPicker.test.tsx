import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeLabel } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { LabelsPicker } from "./task-properties.tsx";

describe("LabelsPicker", () => {
  it("keeps the checkbox from shrinking next to a long, truncated label name", async () => {
    const label = makeLabel({ id: "l1", name: "A label name far too long to fit in the popover" });
    const { user } = renderWithProviders(
      <LabelsPicker labels={[label]} selected={[]} onToggle={() => {}}>
        <button type="button">Labels</button>
      </LabelsPicker>,
    );
    await user.click(screen.getByRole("button", { name: "Labels" }));

    const option = await screen.findByRole("option", { name: /far too long/ });
    expect(option.firstElementChild?.classList.contains("shrink-0")).toBe(true);
  });
});
