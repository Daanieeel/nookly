import { describe, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { QuickCreateCalendarEntryDialog } from "./QuickCreateCalendarEntryDialog.tsx";

describe("QuickCreateCalendarEntryDialog accessibility", () => {
  it("has no axe violations", async () => {
    renderWithProviders(
      <QuickCreateCalendarEntryDialog
        spaceId="space-1"
        draft={{ date: new Date(2026, 2, 10), startMin: 540, endMin: 630 }}
        onOpenChange={() => {}}
        onCreated={() => {}}
      />,
    );
    // A Radix dialog renders in a portal, so the whole document is checked.
    await expectNoA11yViolations(document.body);
  });
});
