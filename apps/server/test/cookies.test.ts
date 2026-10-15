import { describe, expect, it } from "bun:test";
import { withoutCookies } from "../src/auth/cookies.ts";

const request = (path: string) =>
  new Request(`http://nookly.test${path}`, {
    method: "POST",
    headers: { cookie: "nookly.session_token=stale", authorization: "Bearer t" },
    body: "{}",
  });

describe("cookies on auth requests", () => {
  it("drops the cookie an app's networking layer attaches, keeping the token", async () => {
    const cleaned = withoutCookies(request("/v1/auth/sign-up/email"));
    expect(cleaned.headers.has("cookie")).toBe(false);
    expect(cleaned.headers.get("authorization")).toBe("Bearer t");
    expect(await cleaned.text()).toBe("{}");
  });

  it("leaves a provider sign in its cookies", () => {
    expect(withoutCookies(request("/v1/auth/callback/google")).headers.has("cookie")).toBe(true);
    expect(withoutCookies(request("/v1/auth/sign-in/social")).headers.has("cookie")).toBe(true);
  });

  it("passes a request without cookies through untouched", () => {
    const plain = new Request("http://nookly.test/v1/auth/sign-in/email", { method: "POST" });
    expect(withoutCookies(plain)).toBe(plain);
  });
});
