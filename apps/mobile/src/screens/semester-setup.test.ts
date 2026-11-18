import { termsUpTo } from "./semester-setup.ts";

describe("the semesters the setup wizard makes", () => {
  it("counts back from the current winter term, oldest first", () => {
    expect(
      termsUpTo("winter_summer", { termType: "winter", year: 2026 }, 4).map((s) => s.title),
    ).toEqual(["Summer 2025", "Winter 2025/26", "Summer 2026", "Winter 2026/27"]);
  });

  it("makes just the current one for a count of one", () => {
    expect(
      termsUpTo("fall_spring_summer", { termType: "spring", year: 2026 }, 1).map((s) => s.title),
    ).toEqual(["Spring 2026"]);
  });

  it("walks a three term year in order", () => {
    expect(
      termsUpTo("fall_spring_summer", { termType: "fall", year: 2026 }, 4).map((s) => s.title),
    ).toEqual(["Fall 2025", "Spring 2026", "Summer 2026", "Fall 2026"]);
  });
});
