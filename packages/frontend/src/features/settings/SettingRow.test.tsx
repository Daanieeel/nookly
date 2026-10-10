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

describe("a setting row with a wide footer", () => {
  it("lets the footer shrink to the dialog instead of pushing past its edge", () => {
    renderWithProviders(
      <SettingRow title="Agent files" description="d" control={null} footer={<p>wide</p>} />,
    );
    // A fieldset is as wide as its widest content unless told otherwise, which made a long
    // folder path run out of the Settings dialog.
    expect(screen.getByRole("group", { name: "Agent files" })).toHaveClass("min-w-0");
  });

  it("gives the description the whole row when there is no control beside it", () => {
    const { container } = renderWithProviders(
      <SettingRow title="Agent files" description="A long description" control={null} />,
    );
    // The control column is 18rem wide, which a row without a control must not keep.
    expect(container.querySelector(".w-72")).toBeNull();
  });

  it("keeps the control column when there is a control", () => {
    const { container } = renderWithProviders(
      <SettingRow title="Theme" description="d" control={<button type="button">x</button>} />,
    );
    expect(container.querySelector(".w-72")).not.toBeNull();
  });

  it("can leave the title off the screen while it still names the row", () => {
    renderWithProviders(
      <SettingRow title="Agent files" description="d" control={null} hideTitle />,
    );
    expect(screen.getByRole("group", { name: "Agent files" })).toBeTruthy();
    expect(screen.getByText("Agent files")).toHaveClass("sr-only");
    // With no title to separate it from, the description sits right under the heading.
    expect(screen.getByRole("group", { name: "Agent files" })).toHaveClass("pt-0");
  });

  it("shows the title otherwise", () => {
    renderWithProviders(<SettingRow title="Theme" description="d" control={null} />);
    expect(screen.getByText("Theme")).not.toHaveClass("sr-only");
  });
});
