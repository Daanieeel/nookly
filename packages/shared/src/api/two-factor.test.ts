import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./client.ts";
import {
  cleanTwoFactorCode,
  firstTwoFactorMethod,
  isWrongCode,
  runSecurityAction,
  needsRecheck,
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

describe("changing how an account is protected", () => {
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
    enableEmailTwoFactor: async () => {
      calls.push("emailOn");
      return summary;
    },
    disableTwoFactor: async (method: "email" | "totp") => {
      calls.push(`off ${method}`);
      return summary;
    },
    startAuthenticator: async () => ({ uri: "otpauth://totp/x", key: "ABCD" }),
    newBackupCodes: async () => ["aaaaa-bbbbb"],
  };

  it("turns methods on and off, and goes back to the overview", async () => {
    expect(await runSecurityAction(api, "emailOn")).toEqual({ name: "overview" });
    expect(await runSecurityAction(api, "emailOff")).toEqual({ name: "overview" });
    expect(await runSecurityAction(api, "authenticatorOff")).toEqual({ name: "overview" });
    expect(calls).toEqual(["emailOn", "off email", "off totp"]);
  });

  it("hands over the key to scan and the new recovery codes", async () => {
    expect(await runSecurityAction(api, "authenticatorOn")).toEqual({
      name: "scan",
      uri: "otpauth://totp/x",
      key: "ABCD",
    });
    expect(await runSecurityAction(api, "newCodes")).toEqual({
      name: "codes",
      codes: ["aaaaa-bbbbb"],
    });
  });
});

describe("telling a wrong code from another failure", () => {
  it("knows a code that was wrong, which the boxes show by turning red", () => {
    expect(isWrongCode(new ApiRequestError(400, "invalid_code", "That code isn't right."))).toBe(
      true,
    );
    expect(isWrongCode(new ApiRequestError(401, "invalid_backup_code", "Invalid"))).toBe(true);
  });

  it("leaves everything else to be said in words", () => {
    expect(isWrongCode(new ApiRequestError(429, "rate_limited", "Too many requests."))).toBe(false);
    expect(isWrongCode(new ApiRequestError(401, "otp_has_expired", "Expired"))).toBe(false);
    expect(isWrongCode(new Error("Can't reach the server."))).toBe(false);
    expect(isWrongCode(null)).toBe(false);
  });
});

describe("being asked to confirm it is you", () => {
  it("knows the server asking for it", () => {
    expect(needsRecheck(new ApiRequestError(403, "recheck_required", "Confirm"))).toBe(true);
    expect(needsRecheck(new ApiRequestError(403, "wrong_password", "Wrong"))).toBe(false);
    expect(needsRecheck(null)).toBe(false);
  });
});
