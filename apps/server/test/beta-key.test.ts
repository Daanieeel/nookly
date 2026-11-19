import { ApiRequestError } from "@nookly/shared/api";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DESKTOP, HOOK_TIMEOUT, PASSWORD, type TestServer, startServer } from "./helpers.ts";

const KEY = "open-sesame-for-the-beta";

let server: TestServer;
beforeEach(async () => {
  server = await startServer({ BETA_KEY: KEY });
}, HOOK_TIMEOUT);
afterEach(async () => {
  await server.stop();
}, HOOK_TIMEOUT);

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiRequestError) return error;
    throw error;
  }
  throw new Error("the sign up went through");
}

describe("the closed beta key", () => {
  it("lets a sign up in with the right key", async () => {
    const api = server.client();
    const user = await api.signUp({ username: "ada", password: PASSWORD, betaKey: KEY }, DESKTOP);
    expect(user.username).toBe("ada");
  });

  it("ignores spaces around the key", async () => {
    const user = await server
      .client()
      .signUp({ username: "ada", password: PASSWORD, betaKey: `  ${KEY}\n` }, DESKTOP);
    expect(user.username).toBe("ada");
  });

  it("refuses a sign up without a key, and makes no account", async () => {
    const error = await refusal(
      server.client().signUp({ username: "ada", password: PASSWORD }, DESKTOP),
    );
    expect(error.status).toBe(403);
    expect(error.message).toContain("beta key");
    const rows = await server.sql`SELECT 1 FROM auth_user`;
    expect(rows).toHaveLength(0);
  });

  it("refuses a wrong key", async () => {
    const error = await refusal(
      server.client().signUp({ username: "ada", password: PASSWORD, betaKey: "nope" }, DESKTOP),
    );
    expect(error.status).toBe(403);
    expect(await server.sql`SELECT 1 FROM auth_user`).toHaveLength(0);
  });

  it("keeps the key out of what is stored", async () => {
    await server.client().signUp({ username: "ada", password: PASSWORD, betaKey: KEY }, DESKTOP);
    const rows = await server.sql`SELECT row_to_json(u)::text AS json FROM auth_user u`;
    expect(JSON.stringify(rows)).not.toContain(KEY);
  });

  it("does not stop anyone from signing in", async () => {
    await server.client().signUp({ username: "ada", password: PASSWORD, betaKey: KEY }, DESKTOP);
    const user = await server.client().signIn("ada", PASSWORD, DESKTOP);
    expect(user.username).toBe("ada");
  });
});

describe("without a beta key set", () => {
  it("signs up as before", async () => {
    await server.stop();
    server = await startServer();
    const user = await server.client().signUp({ username: "ada", password: PASSWORD }, DESKTOP);
    expect(user.username).toBe("ada");
  });
});
