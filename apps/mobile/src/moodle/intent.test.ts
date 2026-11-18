import { signInPath } from "./intent.ts";

describe("signInPath", () => {
  it("sends Moodle's sign in link to the sign in screen", () => {
    expect(signInPath("nookly://token=YWJj")).toBe(
      `/moodle-signin?link=${encodeURIComponent("nookly://token=YWJj")}`,
    );
    expect(signInPath("/token=YWJj")).not.toBeNull();
    expect(signInPath("token=YWJj")).not.toBeNull();
  });

  it("leaves every other link alone", () => {
    expect(signInPath("/entity/abc")).toBeNull();
    expect(signInPath("/settings?resettoken=1")).toBeNull();
  });
});
