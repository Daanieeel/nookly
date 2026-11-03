import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { CrashReportDialog, issueUrl } from "./CrashReportDialog.tsx";

const report = {
  occurredAt: "2026-11-04T10:05:00.000Z",
  appVersion: "0.58.0",
  os: "macos",
  message: "panicked at a.rs:1:1: boom",
  text: "Nookly closed unexpectedly\nVersion: 0.58.0\nSystem: macos\nTime: now\nDetails: boom",
};

describe("CrashReportDialog", () => {
  it("shows nothing when Nookly did not crash", async () => {
    mockCommand("latest_crash_report", null);
    renderWithProviders(<CrashReportDialog />);
    await waitFor(() => expect(callsOf("latest_crash_report")).toHaveLength(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers the report after a crash, hidden until asked for", async () => {
    mockCommand("latest_crash_report", report);
    const { user } = renderWithProviders(<CrashReportDialog />);
    expect(await screen.findByRole("dialog", { name: "Nookly closed unexpectedly" })).toBeVisible();
    expect(screen.queryByLabelText("Report")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show report" }));
    expect(screen.getByLabelText("Report")).toHaveTextContent("Version: 0.58.0");
    await user.click(screen.getByRole("button", { name: "Hide report" }));
    expect(screen.queryByLabelText("Report")).not.toBeInTheDocument();
  });

  it("copies the report text", async () => {
    mockCommand("latest_crash_report", report);
    mockCommand("plugin:clipboard-manager|write_text", null);
    const { user } = renderWithProviders(<CrashReportDialog />);
    await user.click(await screen.findByRole("button", { name: "Copy report" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(callsOf("plugin:clipboard-manager|write_text")).toEqual([
      expect.objectContaining({ text: report.text }),
    ]);
  });

  it("remembers that it was closed, so it does not come back", async () => {
    mockCommand("latest_crash_report", report);
    mockCommand("dismiss_crash_report", null);
    const { user } = renderWithProviders(<CrashReportDialog />);
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(callsOf("dismiss_crash_report")).toEqual([{ occurredAt: report.occurredAt }]);
  });

  it("has no axe violations", async () => {
    mockCommand("latest_crash_report", report);
    renderWithProviders(<CrashReportDialog />);
    await screen.findByRole("dialog");
    await expectNoA11yViolations(document.body);
  });
});

describe("issueUrl", () => {
  it("opens a new GitHub issue with the report in it", () => {
    const url = new URL(issueUrl(report));
    expect(url.origin + url.pathname).toBe("https://github.com/Daanieeel/nookly/issues/new");
    expect(url.searchParams.get("title")).toBe("Nookly closed unexpectedly");
    expect(url.searchParams.get("body")).toContain("Details: boom");
  });
});
