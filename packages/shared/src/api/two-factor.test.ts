import { describe, expect, it } from "vitest";
import {
  cleanTwoFactorCode,
  firstTwoFactorMethod,
  runSecurityAction,
  twoFactorMethodLabels,
} from "./two-factor.ts";
import type { SecuritySummary } from "./schemas.ts";

describe("the second step of a sign in", () => {
  it("starts with the authenticator app, then email, then a recovery code", () => {
    expect(firstTwoFactorMethod(["backup", "email", "totp"])).toBe("totp");
    expect(firstTwoFactorMethod(["backup", "email"])).toBe("email");
    expect(firstTwoFactorMethod(["backup"])).toBe("backup");
    expect(firstTwoFactorMethod([])).toBe("backup");
  });

  it("takes the digits of a code however they were typed or pasted", () => {
    expect(cleanTwoFactorCode("totp", " 123 456 ")).toBe("123456");
    expect(cleanTwoFactorCode("email", "123-456")).toBe("123456");
  });

  it("keeps a recovery code as it is, without case or stray spaces", () => {
    expect(cleanTwoFactorCode("backup", "  ABCDE-fghij ")).toBe("abcde-fghij");
  });

  it("names every method for a person", () => {
    expect(twoFactorMethodLabels.totp.code).toBe("Authenticator code");
    expect(twoFactorMethodLabels.email.code).toBe("Emailed code");
    expect(twoFactorMethodLabels.backup.code).toBe("Recovery code");
  });
});

describe("what a password unlocks in an account's security", () => {
  const summary: SecuritySummary = {
    available: true,
    required: false,
    enabled: true,
    email: { enabled: true, possible: true, address: "a@b.test", confirmed: true },
    authenticator: { enabled: false },
    backupCodesLeft: 10,
  };
  const calls: string[] = [];
  const api = {
    enableEmailTwoFactor: async (password: string) => {
      calls.push(`emailOn ${password}`);
      return summary;
    },
    disableTwoFactor: async (method: "email" | "totp", password: string) => {
      calls.push(`off ${method} ${password}`);
      return summary;
    },
    startAuthenticator: async (password: string) => {
      calls.push(`start ${password}`);
      return { uri: "otpauth://totp/x", key: "ABCD" };
    },
    newBackupCodes: async (password: string) => {
      calls.push(`codes ${password}`);
      return ["aaaaa-bbbbb"];
    },
  };

  it("turns methods on and off, and goes back to the overview", async () => {
    expect(await runSecurityAction(api, "emailOn", "pw")).toEqual({ name: "overview" });
    expect(await runSecurityAction(api, "emailOff", "pw")).toEqual({ name: "overview" });
    expect(await runSecurityAction(api, "authenticatorOff", "pw")).toEqual({ name: "overview" });
    expect(calls).toEqual(["emailOn pw", "off email pw", "off totp pw"]);
  });

  it("hands over the key to scan and the new recovery codes", async () => {
    expect(await runSecurityAction(api, "authenticatorOn", "pw")).toEqual({
      name: "scan",
      uri: "otpauth://totp/x",
      key: "ABCD",
    });
    expect(await runSecurityAction(api, "newCodes", "pw")).toEqual({
      name: "codes",
      codes: ["aaaaa-bbbbb"],
    });
  });
});
