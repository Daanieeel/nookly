import { describe, expect, it } from "vitest";
import type { SignInMethod, SignInSummary } from "./schemas.ts";
import {
  checkNewPassword,
  recheckWays,
  signInActions,
  signInDetail,
  signInProviders,
} from "./sign-in.ts";

const method = (provider: string, extra: Partial<SignInMethod> = {}): SignInMethod => ({
  provider,
  email: `${provider}@example.com`,
  emailVerified: true,
  primary: false,
  canBePrimary: true,
  ...extra,
});

const summary = (methods: SignInMethod[]): SignInSummary => ({
  methods,
  current: methods[0]?.provider ?? null,
  fresh: false,
  secondStep: [],
  offered: ["google", "github"],
});

describe("the ways to sign in a person sees", () => {
  it("puts Nookly Signin first, then what the server offers, then anything else connected", () => {
    expect(signInProviders(summary([method("notion"), method("github")]))).toEqual([
      "credential",
      "google",
      "github",
      "notion",
    ]);
  });

  it("says what each one signs in with", () => {
    expect(signInDetail(undefined)).toBe("Not connected");
    expect(signInDetail(method("github"))).toBe("github@example.com");
    expect(signInDetail(method("github", { email: null }))).toBe("No email shared");
    expect(signInDetail(method("notion", { emailVerified: false }))).toBe(
      "notion@example.com, not confirmed",
    );
  });
});

describe("what can be done with a way to sign in", () => {
  const ids = (given: SignInMethod) => signInActions(given).map((action) => action.label);

  it("offers the primary nothing that would remove it", () => {
    expect(ids(method("credential", { primary: true, canBePrimary: false }))).toEqual([
      "Change Email",
      "Change Password",
    ]);
    expect(ids(method("github", { primary: true, canBePrimary: false }))).toEqual(["Change Email"]);
  });

  it("only offers a change of email to the primary and to Nookly Signin", () => {
    expect(ids(method("github"))).toEqual(["Make Primary", "Disconnect"]);
    expect(ids(method("credential", { canBePrimary: false }))).toEqual([
      "Change Email",
      "Change Password",
      "Disconnect",
    ]);
  });
});

describe("confirming it is you", () => {
  it("takes the password where there is one, or a connected provider", () => {
    expect(recheckWays(summary([method("credential"), method("github")]))).toEqual({
      password: true,
      providers: ["github"],
    });
    expect(recheckWays(summary([method("notion")]))).toEqual({
      password: false,
      providers: ["notion"],
    });
  });
});

describe("a new password", () => {
  it("goes through when both entries are right", () => {
    expect(checkNewPassword("a long password", "a long password")).toEqual({
      password: "a long password",
      problems: {},
    });
  });

  it("says what is wrong, per field", () => {
    const short = checkNewPassword("short", "short");
    expect(short.password).toBeNull();
    expect(short.problems.next).toBeTruthy();
    expect(checkNewPassword("a long password", "another one").problems.confirm).toBe(
      "The passwords don't match",
    );
  });
});
