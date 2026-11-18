import { describe, expect, it } from "vitest";
import { examWhen } from "./exam-model.ts";

describe("an exam's date filter", () => {
  const now = new Date(2026, 10, 18, 12);

  it("sorts an exam into soon, later, past or no date", () => {
    expect(examWhen("2026-11-18", now)).toBe("week");
    expect(examWhen("2026-11-25", now)).toBe("week");
    expect(examWhen("2026-11-26", now)).toBe("later");
    expect(examWhen("2026-11-17", now)).toBe("past");
    expect(examWhen(null, now)).toBe("none");
  });
});
