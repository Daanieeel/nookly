import { describe, expect, it } from "vitest";
import { ApiClient, ApiRequestError } from "./client.ts";
import {
  APP_OUTDATED,
  EXPECTED_SERVER_VERSION,
  SERVER_OUTDATED,
  SERVER_VERSION_HEADER,
  versionProblem,
} from "./server-version.ts";

/// A version one step above or below the one the client was built for.
const [major, minor, patch] = EXPECTED_SERVER_VERSION.split(".").map(Number);
const older = `${major}.${minor}.${patch - 1}`;
const newerMinor = `${major}.${minor + 1}.0`;
const newerPatch = `${major}.${minor}.${patch + 1}`;

describe("which side is out of date", () => {
  it("blames the server when it is older than the client expects", () => {
    expect(versionProblem(older)).toBe("server");
    expect(versionProblem(`${major - 1}.99.99`)).toBe("server");
  });

  it("blames the server when it says nothing, which only a server from before it said so does", () => {
    expect(versionProblem(null)).toBe("server");
    expect(versionProblem(undefined)).toBe("server");
    expect(versionProblem("not a version")).toBe("server");
  });

  it("blames the app when the server is a minor or major version ahead", () => {
    expect(versionProblem(newerMinor)).toBe("app");
    expect(versionProblem(`${major + 1}.0.0`)).toBe("app");
  });

  it("blames nobody for the same version or a newer patch", () => {
    expect(versionProblem(EXPECTED_SERVER_VERSION)).toBeNull();
    expect(versionProblem(newerPatch)).toBeNull();
  });
});

/// The JSON an answer carries: what the server sends.
type Body = Record<string, string | number | boolean>;

const answer = (status: number, body: Body, version: string | null) => async () =>
  new Response(JSON.stringify(body), {
    status,
    headers: version ? { [SERVER_VERSION_HEADER]: version } : {},
  });

const clientOf = (fetch: () => Promise<Response>) =>
  new ApiClient({
    baseUrl: "http://server",
    tokens: { load: async () => "token", save: async () => {} },
    fetch,
  });

/// The error a request fails with.
async function failureOf(request: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await request;
  } catch (error) {
    if (error instanceof ApiRequestError) return error;
    throw error;
  }
  throw new Error("The request did not fail");
}

const invalid = { error: "invalid_request", message: "Some of the request is missing or invalid." };

describe("a request the server could not understand", () => {
  it("says the server is out of date when it is behind the app", async () => {
    const error = await failureOf(
      clientOf(answer(422, { ...invalid, serverVersion: older }, older)).sessions(),
    );
    expect(error.code).toBe(SERVER_OUTDATED);
    expect(error.message).toMatch(/server is out of date/i);
  });

  it("says the server is out of date when it does not report a version at all", async () => {
    const error = await failureOf(clientOf(answer(422, invalid, null)).sessions());
    expect(error.code).toBe(SERVER_OUTDATED);
  });

  it("says the app is out of date when the server is ahead of it", async () => {
    const error = await failureOf(
      clientOf(answer(422, { ...invalid, serverVersion: newerMinor }, newerMinor)).sessions(),
    );
    expect(error.code).toBe(APP_OUTDATED);
    expect(error.message).toMatch(/update/i);
  });

  it("reads the version from the body when the header is gone", async () => {
    const error = await failureOf(
      clientOf(answer(422, { ...invalid, serverVersion: newerMinor }, null)).sessions(),
    );
    expect(error.code).toBe(APP_OUTDATED);
  });

  it("keeps the server's own message when the versions match", async () => {
    const error = await failureOf(
      clientOf(
        answer(
          422,
          { ...invalid, serverVersion: EXPECTED_SERVER_VERSION },
          EXPECTED_SERVER_VERSION,
        ),
      ).sessions(),
    );
    expect(error.code).toBe("invalid_request");
    expect(error.message).toBe(invalid.message);
  });

  it("leaves every other kind of error alone", async () => {
    const body = {
      error: "wrong_password",
      message: "The password is wrong.",
      serverVersion: older,
    };
    const error = await failureOf(clientOf(answer(403, body, older)).sessions());
    expect(error.code).toBe("wrong_password");
    expect(error.message).toBe("The password is wrong.");
  });

  it("says the server is out of date when its answer is not the shape the app reads", async () => {
    const error = await failureOf(clientOf(answer(200, { unexpected: true }, older)).sessions());
    expect(error.code).toBe(SERVER_OUTDATED);
  });

  it("carries the server's version on the error", async () => {
    const error = await failureOf(
      clientOf(answer(422, { ...invalid, serverVersion: older }, older)).sessions(),
    );
    expect(error.serverVersion).toBe(older);
  });
});
