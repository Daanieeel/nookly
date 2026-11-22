import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password-strength.ts";

describe("password strength", () => {
  it("has nothing to say about an empty password", () => {
    expect(passwordStrength("")).toBeNull();
  });

  it("rates common passwords weak, however they are dressed up", () => {
    expect(passwordStrength("password")?.score).toBe(0);
    expect(passwordStrength("Password1!")?.score).toBeLessThanOrEqual(1);
    expect(passwordStrength("qwertyuiop")?.score).toBeLessThanOrEqual(1);
  });

  it("rates a long, unusual passphrase strong", () => {
    const strength = passwordStrength("violet lantern kettle orbit ferment");
    expect(strength?.score).toBe(4);
    expect(strength?.label).toBe("Strong");
  });

  it("counts what is known about the person against the password", () => {
    const plain = passwordStrength("adalovelace1815");
    const known = passwordStrength("adalovelace1815", ["ada", "lovelace"]);
    expect(known!.score).toBeLessThanOrEqual(plain!.score);
  });

  it("names the score in words", () => {
    const weak = passwordStrength("password");
    const strong = passwordStrength("violet lantern kettle orbit ferment");
    expect(weak?.label).toBe("Very weak");
    expect(strong?.label).toBe("Strong");
    for (const sample of ["tr0ub4dor&3", "correcthorsebatterystaple", "Summer2024!"]) {
      const strength = passwordStrength(sample);
      expect(["Very weak", "Weak", "Fair", "Good", "Strong"]).toContain(strength?.label);
    }
  });

  it("stays fast on a very long password", () => {
    const started = performance.now();
    passwordStrength("a".repeat(5000));
    expect(performance.now() - started).toBeLessThan(500);
  });
});
