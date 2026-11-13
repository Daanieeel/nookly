import { describe, expect, it } from "@jest/globals";
import { labelOption, spaceOption, statusOption } from "./option-badges.tsx";

describe("picker badges (D50)", () => {
  it("tints a status's badge with the status's own colour", () => {
    const option = statusOption({
      id: "in_progress",
      name: "In Progress",
      color: "#3b82f6",
      doneness: 50,
      position: 2,
    });
    expect(option).toMatchObject({ id: "in_progress", label: "In Progress", tint: "#3b82f6" });
    expect(option.icon).toBeTruthy();
  });

  it("tints a label's badge with the label's colour", () => {
    const option = labelOption({ id: "l1", spaceId: "s1", name: "Urgent", color: "#ef4444" });
    expect(option).toMatchObject({ id: "l1", label: "Urgent", tint: "#ef4444" });
  });

  it("tints a Space's badge with the Space's colour", () => {
    const option = spaceOption({
      id: "s1",
      name: "Study",
      color: "#22c55e",
      icon: null,
      position: 0,
    });
    expect(option).toMatchObject({ id: "s1", label: "Study", tint: "#22c55e" });
  });
});
