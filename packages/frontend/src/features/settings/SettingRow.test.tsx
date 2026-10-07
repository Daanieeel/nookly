import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { SettingRow } from "./SettingRow.tsx";

const WRITE = "plugin:clipboard-manager|write_text";

function renderRow() {
  return renderWithProviders(
    <SettingRow
      title="Theme"
      description="Light or dark."
      settingId="appearance.theme"
      control={<button type="button">control</button>}
    />,
  );
}

beforeEach(() => {
  mockCommand(WRITE, null);
});

describe("a setting row id", () => {
  it("sits above the title", () => {
    renderRow();
    const id = screen.getByRole("button", { name: "Copy setting ID appearance.theme" });
    const title = screen.getByText("Theme");
    expect(id.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(id.closest("code")).toBeNull();
    expect(id).toHaveTextContent("appearance.theme");
  });

  it("is one button that copies the exact id and confirms in place", async () => {
    const { user } = renderRow();
    const button = screen.getByRole("button", { name: "Copy setting ID appearance.theme" });
    await user.click(button);
    expect(callsOf(WRITE)).toEqual([expect.objectContaining({ text: "appearance.theme" })]);
    expect(await screen.findByText("Copied appearance.theme")).toBeInTheDocument();
  });

  it("is keyboard focusable and shows a tooltip", async () => {
    const { user } = renderRow();
    await user.tab();
    const button = screen.getByRole("button", { name: "Copy setting ID appearance.theme" });
    expect(button).toHaveFocus();
    expect((await screen.findAllByText("Copy setting ID")).length).toBeGreaterThan(0);
  });

  it("has no axe violations", async () => {
    renderRow();
    await expectNoA11yViolations();
  });

  it("has no id button without a setting", () => {
    renderWithProviders(<SettingRow title="Version" description="d" control={<span>1</span>} />);
    expect(screen.queryByRole("button", { name: /Copy setting ID/ })).toBeNull();
  });
});
