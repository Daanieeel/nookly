import { describe, expect, it, vi } from "vitest";
import { ApiClient, type TokenStore } from "./client.ts";

/// The device's one token store (the Keychain on a phone), shared by every API client the
/// app makes: one per sign in.
class OneStore implements TokenStore {
  token: string | null = null;
  async load() {
    return this.token;
  }
  async save(token: string | null) {
    this.token = token;
  }
}

/// A server that has ended the old session and knows only the new one.
const server = (valid: string) => async (_url: string, init?: RequestInit) => {
  const auth = new Headers(init?.headers).get("authorization");
  return auth === `Bearer ${valid}`
    ? new Response(JSON.stringify({ sessions: [] }), { status: 200 })
    : new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
};

describe("a client of a session that has ended", () => {
  it("never signs out the account signed in after it", async () => {
    // Bug: after signing out and into another account, a request still on its way from the
    // old client came back 401. The old client then wiped the shared token store (the new
    // account's token) and reported a sign out, so the phone was signed out on its next
    // launch and its edits were never sent.
    const store = new OneStore();
    store.token = "old";
    let oldSignedOut = 0;
    const old = new ApiClient({
      baseUrl: "http://server",
      tokens: store,
      fetch: server("new"),
      onSignedOut: () => oldSignedOut++,
    });
    await old.sessionToken();
    // Signed in again, to another account: the store now holds the new token.
    await store.save("new");
    const fresh = new ApiClient({ baseUrl: "http://server", tokens: store, fetch: server("new") });
    await expect(old.sessions()).rejects.toThrow();
    expect(store.token).toBe("new");
    expect(oldSignedOut).toBe(0);
    expect(await fresh.sessions()).toEqual([]);
  });

  it("still forgets its own token when the server ends its session", async () => {
    const store = new OneStore();
    store.token = "mine";
    let signedOut = 0;
    const client = new ApiClient({
      baseUrl: "http://server",
      tokens: store,
      fetch: server("other"),
      onSignedOut: () => signedOut++,
    });
    await expect(client.sessions()).rejects.toThrow();
    expect(store.token).toBeNull();
    expect(signedOut).toBe(1);
  });

  it("does not clear a newer sign in when its own sign out finishes late", async () => {
    const store = new OneStore();
    store.token = "old";
    let release = () => {};
    let sent = false;
    const slow = async () => {
      sent = true;
      await new Promise<void>((resolve) => (release = resolve));
      return new Response(null, { status: 204 });
    };
    const old = new ApiClient({ baseUrl: "http://server", tokens: store, fetch: slow });
    const leaving = old.signOut();
    await vi.waitFor(() => expect(sent).toBe(true));
    await store.save("new");
    release();
    await leaving;
    expect(store.token).toBe("new");
  });
});
