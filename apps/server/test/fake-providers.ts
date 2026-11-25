import { spyOn } from "bun:test";
import type { ApiClient, DeviceInfo, ProviderBegin, User } from "@nookly/shared/api";
import type { TestServer } from "./helpers.ts";

/// Stands in for GitHub and Notion: their token exchange and profile calls are answered from
/// the people listed here, so a whole provider sign in runs against the real server.

export interface Person {
  /// The provider's id for the account.
  id: number;
  email: string | null;
  verified?: boolean;
}

export type FakeProvider = "github" | "notion";

/// The code the provider hands back is the person's key, and so is the token it is swapped for.
export function fakeProviders() {
  const people = new Map<string, Person>();
  const real = globalThis.fetch;
  const answer = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
    const person = people.get(bearer);
    if (url.host === "github.com" && url.pathname === "/login/oauth/access_token") {
      const code = new URLSearchParams(await request.text()).get("code") ?? "";
      return Response.json({
        access_token: code,
        token_type: "bearer",
        scope: "read:user,user:email",
      });
    }
    if (url.host === "api.github.com" && person) {
      if (url.pathname === "/user/emails") {
        return Response.json(
          person.email
            ? [{ email: person.email, primary: true, verified: person.verified ?? true }]
            : [],
        );
      }
      return Response.json({ id: person.id, login: bearer, name: bearer, email: person.email });
    }
    if (url.host === "api.notion.com" && url.pathname === "/v1/oauth/token") {
      const code = new URLSearchParams(await request.text()).get("code") ?? "";
      return Response.json({ access_token: code, token_type: "bearer" });
    }
    if (url.host === "api.notion.com" && person) {
      const user = {
        id: `notion-${person.id}`,
        name: bearer,
        person: person.email ? { email: person.email } : {},
      };
      return Response.json({ bot: { owner: { user } } });
    }
    return real(input, init);
  };
  const spy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(answer, { preconnect: real.preconnect }),
  );
  return { people, restore: () => spy.mockRestore() };
}

/// What the browser does after the app began: the provider sends it to the server's callback,
/// which sends it on to the page that hands the app a code. Answers that code, or the reason
/// there is none.
export async function browserLeg(
  server: TestServer,
  provider: FakeProvider,
  begun: ProviderBegin,
  person: string,
): Promise<{ code: string | null; error: string | null; page: string }> {
  const state = new URL(begun.url).searchParams.get("state") ?? "";
  const here = (address: string) =>
    new URL(address.replace("http://nookly.test", ""), server.baseUrl);
  const callback = await fetch(
    here(`/v1/auth/callback/${provider}?code=${person}&state=${state}`),
    { redirect: "manual" },
  );
  const location = callback.headers.get("location") ?? "";
  const cookie = callback.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  const done = await fetch(here(location), { headers: { cookie } });
  const page = await done.text();
  return {
    code: page.match(/nookly:\/\/auth\?code=([A-Za-z0-9_-]+)/)?.[1] ?? null,
    error: page.match(/nookly:\/\/auth\?error=([a-z0-9_]+)/)?.[1] ?? null,
    page,
  };
}

/// A whole sign in with a provider from an app. Throws what the app would.
export async function providerSignIn(
  server: TestServer,
  api: ApiClient,
  provider: FakeProvider,
  person: string,
  device: DeviceInfo,
  options: { createAccount?: boolean } = {},
): Promise<User> {
  const begun = await api.beginProviderSignIn({ provider, ...options });
  const back = await browserLeg(server, provider, begun, person);
  if (!back.code) throw new Error(back.error ?? "no code");
  return api.finishProviderSignIn(back.code, begun.secret, device);
}
