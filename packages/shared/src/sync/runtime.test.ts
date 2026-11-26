import { createHash } from "node:crypto";
import { PRODUCTION_SERVER, TERMS_VERSION } from "../api/index.ts";
import { ApiRequestError, ProviderNoAccountError, TwoFactorRequiredError } from "../api/index.ts";
import type { DeviceInfo, SignInChange, SignUp, TwoFactorMethod, User } from "../api/index.ts";
import type { ConflictReport, ServerConflict } from "./protocol.ts";
import type { BlobPlatform, BlobTarget } from "./blobs.ts";
import { type LiveHandlers, NetworkError, type SyncTransport } from "./client.ts";
import { MemoryServer } from "./testing/memory-server.ts";
import { NodeSqliteDriver } from "./testing/node-driver.ts";
import { describe, expect, it, vi } from "vitest";
import { type AccountApi, SyncRuntime } from "./runtime.ts";

const ADA: User = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "ada",
  email: "ada@example.com",
  emailVerified: true,
  createdAt: "2026-10-14T00:00:00Z",
  termsVersion: null,
  needsUsername: false,
};

/// The account API against an in-memory server: what the runtime calls, nothing more.
class FakeAccount implements AccountApi {
  signedIn = false;
  /// Who the account is; the terms they have agreed to are part of it.
  user: User = ADA;
  /// What the real client calls when the server ends this device's session.
  onSignedOut: () => void = () => {};
  readonly server: MemoryServer;
  readonly calls: string[] = [];

  constructor(server: MemoryServer) {
    this.server = server;
  }

  async signUp(input: SignUp, device: DeviceInfo) {
    this.calls.push(`signUp ${input.username} ${device.platform}`);
    this.signedIn = true;
    return this.user;
  }
  async signIn(identifier: string) {
    this.calls.push(`signIn ${identifier}`);
    if (identifier !== ADA.username) throw new Error("The username or the password is wrong.");
    if (this.secondStep) throw new TwoFactorRequiredError("challenge-1", this.secondStep);
    this.signedIn = true;
    return this.user;
  }
  /// The methods an account with two-factor answers a password sign in with.
  secondStep: TwoFactorMethod[] | null = null;
  async sendTwoFactorEmail(challenge: string) {
    this.calls.push(`sendTwoFactorEmail ${challenge}`);
  }
  async verifyTwoFactor(
    challenge: string,
    method: TwoFactorMethod,
    code: string,
    device: DeviceInfo,
  ) {
    this.calls.push(`verify ${challenge} ${method} ${code} ${device.platform}`);
    if (code !== "123456") throw new Error("That code isn't right.");
    this.signedIn = true;
    return this.user;
  }
  offered = ["google", "github", "notion"];
  async providers() {
    return this.offered;
  }
  /// What the server hands out when a sign in with a provider begins.
  begun: { provider: string; port?: number; betaKey?: string; createAccount?: boolean }[] = [];
  async beginProviderSignIn(input: {
    provider: string;
    port?: number;
    betaKey?: string;
    createAccount?: boolean;
  }) {
    this.begun.push(input);
    return { url: `https://accounts.example/${input.provider}`, secret: "the-apps-secret" };
  }
  async finishProviderSignIn(code: string, secret: string, device: DeviceInfo) {
    this.calls.push(`finish ${code} ${secret} ${device.platform}`);
    if (code === "stale") throw new Error("The sign in expired. Try again.");
    this.signedIn = true;
    return this.user;
  }
  /// What the server hands out when a confirmation with the provider begins.
  confirmations: { provider: string; port?: number }[] = [];
  async beginConfirmation(input: { provider: string; port?: number }) {
    this.confirmations.push(input);
    return { url: `https://accounts.example/confirm/${input.provider}`, secret: "confirm-secret" };
  }
  async finishConfirmation(code: string, secret: string) {
    this.calls.push(`confirm ${code} ${secret}`);
    if (code === "stale") throw new Error("The confirmation expired. Try again.");
  }
  async setUsername(username: string) {
    this.calls.push(`setUsername ${username}`);
    this.user = { ...this.user, username, needsUsername: false };
    return this.user;
  }
  async signOut() {
    this.calls.push("signOut");
    this.signedIn = false;
  }
  async me() {
    return this.user;
  }
  async acceptTerms(version: string) {
    this.calls.push(`acceptTerms ${version}`);
    this.user = { ...this.user, termsVersion: version };
    return this.user;
  }
  async isSignedIn() {
    return this.signedIn;
  }
  /// The ways the account signs in, as the server lists them, and the one this device used.
  methods = ["credential", "github"];
  current = "credential";
  private signInSummary(signedOut: boolean): SignInChange {
    return {
      methods: this.methods.map((provider) => ({
        provider,
        email: null,
        emailVerified: false,
        primary: provider === "credential",
        canBePrimary: false,
      })),
      current: this.current,
      fresh: true,
      secondStep: [],
      offered: this.offered,
      signedOut,
    };
  }
  async signInMethods() {
    return this.signInSummary(false);
  }
  async beginLink(input: { provider: string; port?: number }) {
    this.calls.push(`beginLink ${input.provider}`);
    return { url: `https://accounts.example/link/${input.provider}`, secret: "link-secret" };
  }
  async finishLink(code: string, secret: string) {
    this.calls.push(`link ${code} ${secret}`);
    this.methods.push("notion");
    return this.signInSummary(false);
  }
  unlinkFails = false;
  async unlink(provider: string) {
    this.calls.push(`unlink ${provider} ${this.liveHandlers ? "live" : "quiet"}`);
    if (this.unlinkFails) throw new Error("The primary way of signing in stays.");
    const mine = provider === this.current;
    this.methods = this.methods.filter((m) => m !== provider);
    if (mine) this.signedIn = false;
    return this.signInSummary(mine);
  }
  /// What the server's conflict log holds for the account.
  serverConflicts: ServerConflict[] = [];
  async conflicts() {
    return this.serverConflicts;
  }
  /// Like the server: a reported clash joins the log until someone decides on it.
  async reportConflict(report: ConflictReport) {
    const id = crypto.randomUUID();
    this.serverConflicts.push({ ...report, id, createdAt: new Date().toISOString() });
    return { id, resolved: false };
  }
  async resolveConflict(id: string) {
    this.serverConflicts = this.serverConflicts.filter((c) => c.id !== id);
  }
  async devices() {
    return [];
  }
  async sessionToken() {
    return this.signedIn ? "token" : null;
  }
  /// Every request fails, like a server that is down.
  offline = false;
  /// Every pull is refused until two-factor is set up, as the server answers it.
  owesTwoFactor = false;
  /// Pushes fail from this many on, like a connection that drops mid sync.
  failPushesAfter = Number.POSITIVE_INFINITY;
  pushes = 0;
  pulls = 0;
  /// Pushes wait for this, like a slow connection.
  gate: Promise<void> | null = null;
  /// The live channel's handlers while it is open, for a test to send the device news.
  liveHandlers: LiveHandlers | null = null;
  syncTransport(): SyncTransport {
    return {
      live: (handlers) => {
        this.liveHandlers = handlers;
        handlers.onOpen();
        return () => {
          this.liveHandlers = null;
        };
      },
      push: async (r) => {
        await this.gate;
        this.pushes += 1;
        if (this.pushes > this.failPushesAfter) throw new NetworkError("connection lost");
        this.calls.push("push");
        return this.server.push(r);
      },
      pull: async (r) => {
        this.pulls += 1;
        if (this.offline) throw new NetworkError("Can't reach the server.");
        if (this.owesTwoFactor) {
          throw new ApiRequestError(403, "two_factor_required", "Set up two-factor.");
        }
        return this.server.pull(r);
      },
    };
  }
  async missing(table: string, pks: string[]) {
    return pks.filter((pk) => !this.server.records.has(`${table}\u0000${pk}`));
  }
  /// Which file contents the account holds.
  hasBlob = async (_sha256: string) => false;
}

function runtime(
  server = new MemoryServer(),
  driver = new NodeSqliteDriver(),
  backup?: () => Promise<{ path: string }>,
  blobs?: BlobPlatform,
) {
  const account = new FakeAccount(server);
  const reindex = vi.fn(async (_ids: string[]) => {});
  const onApplied = vi.fn();
  const sync = new SyncRuntime({
    driver,
    connect: (_url, onSignedOut) => {
      account.onSignedOut = onSignedOut;
      return account;
    },
    device: { name: "Nookly on macOS", platform: "macos" },
    reindex,
    onApplied,
    backup,
    blobs: blobs && (() => blobs),
  });
  return { sync, account, driver, server, reindex, onApplied };
}

const now = () => new Date().toISOString();

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function addSpace(driver: NodeSqliteDriver, id = "s1", name = "Personal") {
  driver.exec(
    "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES (?, ?, 'blue', ?, ?)",
    id,
    name,
    now(),
    now(),
  );
}

describe("the account's email confirmation", () => {
  const UNCONFIRMED: User = { ...ADA, emailVerified: false, termsVersion: TERMS_VERSION };

  it("shows as confirmed at once when the server says the account changed", async () => {
    const { sync, account, driver } = runtime();
    account.user = UNCONFIRMED;
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    expect(sync.store.getState().user?.emailVerified).toBe(false);

    // Bug: the device kept showing the email as unconfirmed until it was restarted.
    account.user = { ...UNCONFIRMED, emailVerified: true };
    account.liveHandlers?.onAccount?.();
    await vi.waitFor(() => expect(sync.store.getState().user?.emailVerified).toBe(true));
    const saved = driver.rows("SELECT value FROM sync_meta WHERE key = 'user'");
    expect(JSON.parse(String(saved[0]?.value)).emailVerified).toBe(true);
    sync.stop();
  });

  it("is checked again on every sync until it is confirmed, in case the notice was missed", async () => {
    const { sync, account } = runtime();
    account.user = UNCONFIRMED;
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    account.user = { ...UNCONFIRMED, emailVerified: true };
    await sync.syncNow();
    await vi.waitFor(() => expect(sync.store.getState().user?.emailVerified).toBe(true));
    sync.stop();
  });

  it("is not asked about once it is confirmed", async () => {
    const { sync, account } = runtime();
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    const me = vi.spyOn(account, "me");
    await sync.syncNow();
    await sync.syncNow();
    expect(me).not.toHaveBeenCalled();
    sync.stop();
  });
});

describe("the terms of Nookly's own server", () => {
  it("hold sync back for an account that has not agreed to them, until it does", async () => {
    const { sync, account, driver } = runtime();
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    expect(sync.store.getState().termsPending).toBe(true);
    expect(driver.rows("SELECT * FROM sync_meta WHERE key = 'enabled'")).toEqual([]);
    expect(account.calls).not.toContain("push");

    await sync.acceptTerms();
    expect(account.calls).toContain(`acceptTerms ${TERMS_VERSION}`);
    expect(sync.store.getState().termsPending).toBe(false);
    expect(sync.store.getState().user?.termsVersion).toBe(TERMS_VERSION);
    expect(driver.rows("SELECT * FROM sync_meta WHERE key = 'enabled'")).not.toEqual([]);
    sync.stop();
  });

  it("do not stop an account that has agreed, and nothing waits", async () => {
    const { sync, account } = runtime();
    account.user = { ...ADA, termsVersion: TERMS_VERSION };
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    expect(sync.store.getState().termsPending).toBe(false);
    await sync.syncNow();
    expect(sync.store.getState().status.state).toBe("idle");
    sync.stop();
  });

  it("ask again when the terms change, on launch too", async () => {
    const { sync, account, driver } = runtime();
    account.user = { ...ADA, termsVersion: "2020-01-01" };
    account.signedIn = true;
    await sync.restore(PRODUCTION_SERVER);
    expect(sync.store.getState().termsPending).toBe(true);
    expect(driver.rows("SELECT * FROM sync_meta WHERE key = 'enabled'")).toEqual([]);
  });

  it("do not apply to a server someone runs themselves", async () => {
    const { sync } = runtime();
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    expect(sync.store.getState().termsPending).toBe(false);
    await sync.syncNow();
    expect(sync.store.getState().status.state).toBe("idle");
    sync.stop();
  });

  it("leave a failed agreement open, so it can be tried again", async () => {
    const { sync, account } = runtime();
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    account.acceptTerms = async () => {
      throw new Error("Can't reach the server.");
    };
    await expect(sync.acceptTerms()).rejects.toThrow("Can't reach");
    expect(sync.store.getState().termsPending).toBe(true);
  });
});

describe("the desktop's sync", () => {
  it("is off until someone signs in", async () => {
    const { sync, driver } = runtime();
    await sync.restore("https://sync.example.com");
    expect(sync.store.getState().user).toBeNull();
    expect(driver.rows("SELECT * FROM sync_meta WHERE key = 'enabled'")).toEqual([]);
  });

  it("signs up, turns sync on and sends what is already here", async () => {
    const { sync, account, driver, server } = runtime();
    driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
      now(),
      now(),
    );
    await sync.signUp("https://sync.example.com/", {
      username: "ada",
      password: "a long password",
    });
    expect(account.calls[0]).toBe("signUp ada macos");
    expect(sync.store.getState()).toMatchObject({
      user: ADA,
      serverUrl: "https://sync.example.com",
    });
    await sync.syncNow();
    expect(server.records.has("spaces\u0000s1")).toBe(true);
    expect(sync.store.getState().status.state).toBe("idle");
    sync.stop();
  });

  it("brings in changes from elsewhere, refreshes the views and the search index", async () => {
    const server = new MemoryServer();
    const other = runtime(server);
    other.driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
      now(),
      now(),
    );
    other.driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at) VALUES ('n1', 's1', 'note', 'From the phone', ?, ?)",
      now(),
      now(),
    );
    await other.sync.signIn("https://sync.example.com", "ada", "a long password");
    await other.sync.syncNow();
    other.sync.stop();

    const here = runtime(server);
    await here.sync.signIn("https://sync.example.com", "ada", "a long password");
    await here.sync.syncNow();
    expect(here.driver.rows("SELECT title FROM entities")).toEqual([{ title: "From the phone" }]);
    expect(here.reindex).toHaveBeenCalledWith(expect.arrayContaining(["n1"]));
    expect(here.onApplied).toHaveBeenCalled();
    here.sync.stop();
  });

  it("keeps a failed sign in visible and sync off", async () => {
    const { sync } = runtime();
    await expect(sync.signIn("https://sync.example.com", "nobody", "x")).rejects.toThrow("wrong");
    expect(sync.store.getState().user).toBeNull();
  });

  it("signs out and leaves the device as new: its data is in the account, not here", async () => {
    const { sync, account, driver, server, onApplied } = runtime();
    addSpace(driver);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.syncNow();
    onApplied.mockClear();
    await sync.signOut();
    expect(account.calls.at(-1)).toBe("signOut");
    expect(sync.store.getState()).toMatchObject({ user: null, status: { state: "off" } });
    expect(driver.rows("SELECT name FROM spaces")).toEqual([]);
    expect(server.records.has("spaces\u0000s1")).toBe(true);
    // What every new device starts with is back.
    expect(driver.rows("SELECT COUNT(*) AS n FROM task_statuses")[0].n).toBe(5);
    expect(driver.rows("SELECT COUNT(*) AS n FROM sync_rows")[0].n).toBe(0);
    expect(driver.rows("SELECT COUNT(*) AS n FROM sync_dirty")[0].n).toBe(0);
    expect(onApplied).toHaveBeenCalled();
    expect(await sync.localDataCount()).toBe(0);
  });

  it("clears nothing when asked to sign out while nobody is signed in", async () => {
    const { sync, driver } = runtime();
    addSpace(driver);
    await sync.signOut();
    expect(driver.rows("SELECT name FROM spaces")).toEqual([{ name: "Personal" }]);
  });

  it("backs the device up before signing out when something never reached the account", async () => {
    const backup = vi.fn(async () => ({ path: "/backups/before-sign-out" }));
    const { sync, account, driver } = runtime(undefined, undefined, backup);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    backup.mockClear();
    account.failPushesAfter = account.pushes;
    addSpace(driver);
    expect(await sync.unsentCount()).toBe(1);
    const result = await sync.signOut();
    expect(backup).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ unsent: 1, backupPath: "/backups/before-sign-out" });
    expect(driver.rows("SELECT name FROM spaces")).toEqual([]);
  });

  it("keeps every row on the device when signing out with a local copy", async () => {
    const backup = vi.fn(async () => ({ path: "/backups/unused" }));
    const { sync, account, driver } = runtime(undefined, undefined, backup);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    account.failPushesAfter = account.pushes;
    addSpace(driver);
    driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at) VALUES ('n1', 's1', 'note', 'Mine', ?, ?)",
      now(),
      now(),
    );
    expect(await sync.unsentCount()).toBe(2);
    const result = await sync.signOut({ keepLocalCopy: true });
    // Nothing is cleared, so nothing needs a backup.
    expect(backup).not.toHaveBeenCalled();
    expect(result).toEqual({ unsent: 2, backupPath: null });
    expect(account.calls).toContain("signOut");
    expect(sync.store.getState()).toMatchObject({ user: null, status: { state: "off" } });
    expect(driver.rows("SELECT name FROM spaces")).toEqual([{ name: "Personal" }]);
    expect(driver.rows("SELECT COUNT(*) AS n FROM sync_rows")[0].n).toBe(0);
    expect(driver.rows("SELECT COUNT(*) AS n FROM sync_dirty")[0].n).toBe(0);
    // Local only now: the next sign in asks what to do with it.
    expect(await sync.localDataCount()).toBe(1);
  });

  it("keeps the local copy even when the server can't be told about the sign out", async () => {
    const { sync, account, driver } = runtime();
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    addSpace(driver);
    account.signOut = async () => {
      throw new NetworkError("Can't reach the server.");
    };
    await sync.signOut({ keepLocalCopy: true });
    expect(sync.store.getState().user).toBeNull();
    expect(driver.rows("SELECT name FROM spaces")).toEqual([{ name: "Personal" }]);
  });

  it("stays signed in with everything in place when that backup fails", async () => {
    let fail = false;
    const backup = vi.fn(async () => {
      if (fail) throw new Error("The disk is full.");
      return { path: "/backups/first" };
    });
    const { sync, account, driver } = runtime(undefined, undefined, backup);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    account.failPushesAfter = account.pushes;
    addSpace(driver);
    fail = true;
    await expect(sync.signOut()).rejects.toThrow("The disk is full.");
    expect(sync.store.getState().user).toEqual(ADA);
    expect(driver.rows("SELECT name FROM spaces")).toEqual([{ name: "Personal" }]);
    expect(await sync.unsentCount()).toBe(1);
    sync.stop();
  });

  it("keeps every row when the account itself was deleted", async () => {
    const { sync, driver } = runtime();
    addSpace(driver);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    await sync.detach();
    expect(sync.store.getState()).toMatchObject({ user: null, status: { state: "off" } });
    expect(driver.rows("SELECT name FROM spaces")).toEqual([{ name: "Personal" }]);
    expect(driver.rows("SELECT COUNT(*) AS n FROM sync_rows")[0].n).toBe(0);
  });

  it("removes everything from a device the server signed out, so a lost one holds nothing", async () => {
    const backup = vi.fn(async () => ({ path: "/backups/unused" }));
    const { sync, account, driver, reindex, onApplied } = runtime(undefined, undefined, backup);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    addSpace(driver);
    driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at) VALUES ('n1', 's1', 'note', 'Mine', ?, ?)",
      now(),
      now(),
    );
    await sync.settled();
    onApplied.mockClear();
    // Signed out from another device: the session is gone, so this one can't sync any more.
    account.signedIn = false;
    account.onSignedOut();
    await vi.waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(sync.store.getState().user).toBeNull();
    expect(driver.rows("SELECT name FROM spaces")).toEqual([]);
    expect(driver.rows("SELECT COUNT(*) AS n FROM sync_rows")[0].n).toBe(0);
    expect(driver.rows("SELECT COUNT(*) AS n FROM sync_dirty")[0].n).toBe(0);
    expect(driver.rows("SELECT COUNT(*) AS n FROM task_statuses")[0].n).toBe(5);
    expect(sync.store.getState()).toMatchObject({ status: { state: "off" } });
    expect(sync.store.getState().signedOutReason).toContain("removed from this device");
    // No backup either: that would be a copy left on the device.
    expect(backup).not.toHaveBeenCalled();
    expect(reindex).toHaveBeenCalledWith(["n1"]);
    expect(await sync.localDataCount()).toBe(0);
  });

  it("says how much is on a device before anyone signs in, and nothing once it syncs", async () => {
    const { sync, driver } = runtime();
    expect(await sync.localDataCount()).toBe(0);
    addSpace(driver);
    driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at) VALUES ('n1', 's1', 'note', 'Mine', ?, ?)",
      now(),
      now(),
    );
    expect(await sync.localDataCount()).toBe(1);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    expect(await sync.localDataCount()).toBe(0);
    sync.stop();
  });

  it("keeps a device's own data out of the account when asked: backed up, then cleared", async () => {
    const server = new MemoryServer();
    const other = runtime(server);
    addSpace(other.driver, "s9", "From the account");
    await other.sync.signIn("https://sync.example.com", "ada", "a long password");
    await other.sync.settled();
    other.sync.stop();

    const backup = vi.fn(async () => ({ path: "/backups/set-aside" }));
    const here = runtime(server, undefined, backup);
    addSpace(here.driver);
    await here.sync.signIn("https://sync.example.com", "ada", "a long password", {
      localData: "setAside",
    });
    await here.sync.settled();
    expect(backup).toHaveBeenCalled();
    expect(here.driver.rows("SELECT name FROM spaces")).toEqual([{ name: "From the account" }]);
    expect(server.records.has("spaces\u0000s1")).toBe(false);
    here.sync.stop();
  });

  it("shows no first sync page for data kept out of the account, only the rows a new device starts with", async () => {
    // Bug: clearing the device put the default rows back, and the first sync counted them
    // as the person's data: it showed "Bringing this device into your account" with 21 items.
    const backup = vi.fn(async () => ({ path: "/backups/set-aside" }));
    const { sync, driver } = runtime(undefined, undefined, backup);
    addSpace(driver);
    await sync.signIn("https://sync.example.com", "ada", "a long password", {
      localData: "setAside",
    });
    await sync.settled();
    expect(backup).toHaveBeenCalledTimes(1);
    expect(sync.store.getState().migration).toBeNull();
    sync.stop();
  });

  it("shows no first sync page for a device with nothing on it", async () => {
    const backup = vi.fn(async () => ({ path: "/b.zip" }));
    const { sync } = runtime(undefined, undefined, backup);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    expect(backup).not.toHaveBeenCalled();
    expect(sync.store.getState().migration).toBeNull();
    sync.stop();
  });

  it("is signed in without waiting for the first sync to send everything", async () => {
    // Bug: the sign in dialog stayed up, spinning, until every item had been sent.
    const { sync, account, driver } = runtime(undefined, undefined, async () => ({
      path: "/b.zip",
    }));
    addSpace(driver);
    let release = () => {};
    account.gate = new Promise<void>((resolve) => (release = resolve));
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    expect(sync.store.getState().user).toEqual(ADA);
    expect(sync.store.getState().migration).toMatchObject({ phase: "sending" });
    expect(account.pushes).toBe(0);
    release();
    await sync.settled();
    expect(sync.store.getState().migration).toMatchObject({ phase: "done" });
    sync.stop();
  });

  it("signs in to nothing and clears nothing when the data can't be backed up first", async () => {
    const backup = vi.fn(async (): Promise<{ path: string }> => {
      throw new Error("The disk is full.");
    });
    const { sync, account, driver } = runtime(undefined, undefined, backup);
    addSpace(driver);
    await expect(
      sync.signIn("https://sync.example.com", "ada", "a long password", { localData: "setAside" }),
    ).rejects.toThrow("The disk is full.");
    expect(driver.rows("SELECT name FROM spaces")).toEqual([{ name: "Personal" }]);
    expect(sync.store.getState().user).toBeNull();
    expect(account.signedIn).toBe(false);
  });

  it("stays signed in when it starts while the server can not be reached", async () => {
    // Bug: the account was only read from the server, so a desktop started offline said
    // "Sign in to sync" although it was signed in and kept syncing once back online.
    const server = new MemoryServer();
    const driver = new NodeSqliteDriver();
    const first = runtime(server, driver);
    await first.sync.signIn("https://sync.example.com", "ada", "a long password");
    await first.sync.settled();
    first.sync.stop();
    const second = runtime(server, driver);
    second.account.signedIn = true;
    second.account.me = async () => {
      throw new NetworkError("Can't reach the server.");
    };
    await second.sync.restore("https://sync.example.com");
    expect(second.sync.store.getState().user).toEqual(ADA);
    second.sync.stop();
  });

  it("is back to full sync as soon as it is told the server can be reached again", async () => {
    // Launched while the server was down, then the server came back: the device must not
    // stay offline until its next retry or the next launch.
    const server = new MemoryServer();
    const driver = new NodeSqliteDriver();
    const first = runtime(server, driver);
    await first.sync.signIn("https://sync.example.com", "ada", "a long password");
    await first.sync.settled();
    first.sync.stop();
    const second = runtime(server, driver);
    second.account.signedIn = true;
    second.account.offline = true;
    second.account.me = async () => {
      throw new NetworkError("Can't reach the server.");
    };
    await second.sync.restore("https://sync.example.com");
    expect(second.sync.store.getState().status.state).toBe("offline");
    second.account.offline = false;
    second.sync.resume();
    await vi.waitFor(() => expect(second.sync.store.getState().status.state).toBe("idle"));
    second.sync.stop();
  });

  it("picks up again after a restart with the saved sign in", async () => {
    const server = new MemoryServer();
    const driver = new NodeSqliteDriver();
    const first = runtime(server, driver);
    await first.sync.signIn("https://sync.example.com", "ada", "a long password");
    first.sync.stop();
    const second = runtime(server, driver);
    second.account.signedIn = true;
    await second.sync.restore("https://sync.example.com");
    expect(second.sync.store.getState().user).toEqual(ADA);
    second.sync.stop();
  });
});

function addNotes(driver: NodeSqliteDriver, count: number) {
  driver.exec(
    "INSERT OR IGNORE INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
    now(),
    now(),
  );
  for (let i = 0; i < count; i++) {
    driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 's1', 'note', ?, ?, ?, 'NOT', ?)",
      `n${i}`,
      `Note ${i}`,
      now(),
      now(),
      i + 1,
    );
  }
}

const serverCount = (server: MemoryServer, table: string) =>
  [...server.records.values()].filter((r) => r.table === table).length;

describe("a first sync of a device with data", () => {
  it("backs up before anything is sent, then sends everything and checks it", async () => {
    const order: string[] = [];
    const { sync, account, driver, server } = runtime(undefined, undefined, async () => {
      order.push(`backup with ${account.calls.filter((c) => c === "push").length} pushes`);
      return { path: "/backups/before-sync.zip" };
    });
    addNotes(driver, 30);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    expect(order).toEqual(["backup with 0 pushes"]);
    expect(serverCount(server, "entities")).toBe(30);
    const migration = sync.store.getState().migration;
    expect(migration).toMatchObject({
      phase: "done",
      backupPath: "/backups/before-sync.zip",
      error: null,
    });
    expect(migration?.items).toBeGreaterThanOrEqual(31);
    expect(migration?.itemsSent).toBe(migration?.items);
    // Local data stays.
    expect(driver.rows("SELECT COUNT(*) AS n FROM entities")[0].n).toBe(30);
    sync.stop();
  });

  it("sends nothing when the backup fails, and tries again on request", async () => {
    let fail = true;
    const { sync, account, driver, server } = runtime(undefined, undefined, async () => {
      if (fail) throw new Error("The disk is full.");
      return { path: "/backups/b.zip" };
    });
    addNotes(driver, 3);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    expect(sync.store.getState().migration).toMatchObject({ phase: "failed" });
    expect(sync.store.getState().migration?.error).toContain("The disk is full.");
    expect(account.calls).not.toContain("push");
    expect(server.records.size).toBe(0);
    expect(driver.rows("SELECT * FROM sync_meta WHERE key = 'enabled'")).toEqual([]);
    fail = false;
    await sync.retryFirstSync();
    await sync.settled();
    expect(serverCount(server, "entities")).toBe(3);
    expect(sync.store.getState().migration?.phase).toBe("done");
    sync.stop();
  });

  it("carries on after the app dies halfway, without losing or doubling anything", async () => {
    const server = new MemoryServer();
    const driver = new NodeSqliteDriver();
    addNotes(driver, 1200);
    const first = runtime(server, driver, async () => ({ path: "/b.zip" }));
    // The first batch of 500 arrives, then the connection (and the app) dies.
    first.account.failPushesAfter = 1;
    await first.sync.signIn("https://sync.example.com", "ada", "a long password");
    await first.sync.settled().catch(() => {});
    first.sync.stop();
    const sentBefore = serverCount(server, "entities");
    expect(sentBefore).toBeGreaterThan(0);
    expect(sentBefore).toBeLessThan(1200);
    expect(first.sync.store.getState().migration?.phase).toBe("sending");

    // Restart on the same database.
    const second = runtime(server, driver, async () => {
      throw new Error("a second backup is never made");
    });
    second.account.signedIn = true;
    await second.sync.restore("https://sync.example.com");
    await second.sync.settled();
    expect(serverCount(server, "entities")).toBe(1200);
    expect(new Set([...server.records.keys()]).size).toBe(server.records.size);
    expect(second.sync.store.getState().migration).toMatchObject({ phase: "done" });
    expect(driver.rows("SELECT COUNT(*) AS n FROM entities")[0].n).toBe(1200);
    second.sync.stop();
  }, 30_000);

  it("finishes without a change the server refuses, which goes on waiting", async () => {
    const server = new MemoryServer();
    server.refuses = (change) => change.table === "entities" && change.pk === "n1";
    const { sync, driver } = runtime(server, undefined, async () => ({ path: "/b" }));
    addNotes(driver, 3);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    await sync.settled();
    const { migration, status } = sync.store.getState();
    expect(migration).toMatchObject({ phase: "done", heldItems: 1 });
    expect(migration?.itemsSent).toBe((migration?.items ?? 0) - 1);
    expect(status.held).toBe(1);
    expect(await sync.unsentCount()).toBe(1);
    expect(await sync.verify()).toBe(0);
    sync.stop();
  });

  it("sends again a row the server turns out not to have", async () => {
    const { sync, driver, server } = runtime(undefined, undefined, async () => ({ path: "/b" }));
    addNotes(driver, 5);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    server.records.delete("entities\u0000n3");
    expect(await sync.verify()).toBe(1);
    await sync.syncNow();
    expect(server.records.has("entities\u0000n3")).toBe(true);
    expect(await sync.verify()).toBe(0);
    sync.stop();
  });

  it("merges into an account that already has data from another device", async () => {
    const server = new MemoryServer();
    const phone = runtime(server);
    phone.driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('sp', 'Phone', 'red', ?, ?)",
      now(),
      now(),
    );
    await phone.sync.signIn("https://sync.example.com", "ada", "a long password");
    await phone.sync.settled();
    phone.sync.stop();

    const desktop = runtime(server, undefined, async () => ({ path: "/b" }));
    addNotes(desktop.driver, 4);
    await desktop.sync.signIn("https://sync.example.com", "ada", "a long password");
    await desktop.sync.settled();
    expect(desktop.driver.rows("SELECT id FROM spaces ORDER BY id")).toEqual([
      { id: "s1" },
      { id: "sp" },
    ]);
    expect(serverCount(server, "spaces")).toBe(2);
    expect(serverCount(server, "entities")).toBe(4);
    desktop.sync.stop();
  });
});

describe("conflicts the person decides on", () => {
  async function disagree() {
    const server = new MemoryServer();
    const mac = runtime(server);
    const phone = runtime(server);
    mac.driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'P', 'blue', ?, ?)",
      now(),
      now(),
    );
    mac.driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES ('t1', 's1', 'task', 'Buy milk', ?, ?, 'TSK', 1)",
      now(),
      now(),
    );
    mac.driver.exec("INSERT INTO tasks (entity_id, status_id) VALUES ('t1', 'todo')");
    for (const side of [mac, phone]) {
      await side.sync.signIn("https://sync.example.com", "ada", "a long password");
      await side.sync.settled();
    }
    mac.driver.exec("UPDATE entities SET title = 'Buy oat milk' WHERE id = 't1'");
    await new Promise((resolve) => setTimeout(resolve, 5));
    phone.driver.exec("UPDATE entities SET title = 'Buy milk and eggs' WHERE id = 't1'");
    await mac.sync.syncNow();
    await phone.sync.syncNow();
    return { mac, phone };
  }

  it("lists a conflict with both versions and which one shows now", async () => {
    const { phone, mac } = await disagree();
    const [view, ...rest] = await phone.sync.conflictViews();
    expect(rest).toEqual([]);
    expect(view).toMatchObject({
      kind: "field",
      itemTitle: "Buy milk and eggs",
      fieldLabel: "Title",
      current: "Buy milk and eggs",
      other: "Buy oat milk",
    });
    expect(view.currentSide.isThisDevice).toBe(true);
    expect(await mac.sync.conflictViews()).toEqual([]);
    mac.sync.stop();
    phone.sync.stop();
  });

  it("keeps the other version when asked, and every device follows", async () => {
    const { phone, mac } = await disagree();
    const [view] = await phone.sync.conflictViews();
    await phone.sync.resolveConflict(view, "other");
    await phone.sync.syncNow();
    await mac.sync.syncNow();
    expect(mac.driver.rows("SELECT title FROM entities WHERE id = 't1'")).toEqual([
      { title: "Buy oat milk" },
    ]);
    expect(await phone.sync.conflictViews()).toEqual([]);
    mac.sync.stop();
    phone.sync.stop();
  });

  it("settles on a combined text the person wrote", async () => {
    const { phone, mac } = await disagree();
    const [view] = await phone.sync.conflictViews();
    await phone.sync.resolveConflict(view, { value: "Buy oat milk and eggs" });
    await phone.sync.syncNow();
    await mac.sync.syncNow();
    expect(mac.driver.rows("SELECT title FROM entities WHERE id = 't1'")).toEqual([
      { title: "Buy oat milk and eggs" },
    ]);
    mac.sync.stop();
    phone.sync.stop();
  });

  it("counts a conflict only the server logged, so every device offers the merge editor", async () => {
    // Two devices online changed the same field at the same moment: the server kept the
    // other version in its log, and no device recorded one of its own. The status said
    // there was nothing to look at, so the merge editor was never offered.
    const { sync: mac, account } = runtime();
    await mac.signIn("https://sync.example.com", "ada", "a long password");
    await mac.settled();
    account.serverConflicts = [
      {
        id: "00000000-0000-4000-8000-0000000000c1",
        table: "entities",
        pk: "t1",
        field: "title",
        losingValue: "Buy oat milk",
        losingClock: "1794422839220-000001-aaaa",
        winningClock: "1794422839220-000001-bbbb",
        createdAt: now(),
      },
    ];
    await mac.syncNow();
    expect(mac.store.getState().status.conflicts).toBe(1);
    mac.stop();
  });

  it("counts a conflict both the device and the server logged once", async () => {
    const { phone, mac } = await disagree();
    const [own] = phone.driver.rows(
      "SELECT losing_clock, winning_clock, created_at FROM sync_conflicts",
    );
    phone.account.serverConflicts = [
      {
        id: "00000000-0000-4000-8000-0000000000c2",
        table: "entities",
        pk: "t1",
        field: "title",
        losingValue: "Buy oat milk",
        losingClock: String(own.losing_clock),
        winningClock: String(own.winning_clock),
        createdAt: String(own.created_at),
      },
    ];
    await phone.sync.syncNow();
    expect(phone.sync.store.getState().status.conflicts).toBe(1);
    mac.sync.stop();
    phone.sync.stop();
  });

  it("keeps what shows now, and the other version stays in the log", async () => {
    const { phone, mac } = await disagree();
    const [view] = await phone.sync.conflictViews();
    await phone.sync.resolveConflict(view, "current");
    expect(await phone.sync.conflictViews()).toEqual([]);
    expect(
      phone.driver.rows("SELECT losing_value FROM sync_conflicts WHERE resolved_at IS NOT NULL"),
    ).toEqual([{ losing_value: '"Buy oat milk"' }]);
    mac.sync.stop();
    phone.sync.stop();
  });
});

/// A disk and storage that always work, for the one file this test sends.
class QuietFiles implements BlobPlatform {
  async hash(_path: string) {
    return { sha256: createHash("sha256").update("lecture").digest("hex"), size: 7 };
  }
  async size() {
    return 7;
  }
  async upload() {}
  async download(): Promise<string> {
    throw new Error("nothing to download");
  }
  async remove() {
    return false;
  }
}

describe("syncing files", () => {
  it("goes quiet once the files are sent instead of syncing again and again", async () => {
    const { sync, account, driver } = runtime(undefined, undefined, undefined, new QuietFiles());
    driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
      now(),
      now(),
    );
    driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES ('f1', 's1', 'file', 'Lecture', ?, ?, 'FIL', 1)",
      now(),
      now(),
    );
    driver.exec(
      "INSERT INTO files (entity_id, local_path, original_filename) VALUES ('f1', '/files/a.pdf', 'a.pdf')",
    );
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.syncNow();
    // The file goes out and its hash is one more change to send; let that settle.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const settled = account.pulls;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(account.pulls).toBe(settled);
    sync.stop();
  });

  it("doesn't count a file's new place on this device as a change waiting to be sent", async () => {
    // Bug: a downloaded file points its row at the local copy, which marks the row as
    // changed. Nothing is sent for it, but the count stayed until the next round.
    const server = new MemoryServer();
    const first = runtime(server, undefined, undefined, new QuietFiles());
    first.driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
      now(),
      now(),
    );
    first.driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES ('f1', 's1', 'file', 'Lecture', ?, ?, 'FIL', 1)",
      now(),
      now(),
    );
    first.driver.exec(
      "INSERT INTO files (entity_id, local_path, original_filename) VALUES ('f1', '/files/a.pdf', 'a.pdf')",
    );
    await first.sync.signIn("https://sync.example.com", "ada", "a long password");
    await first.sync.syncNow();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    first.sync.stop();

    const driver = new NodeSqliteDriver();
    const platform: BlobPlatform = {
      hash: async () => null,
      size: async () => null,
      upload: async () => {},
      download: async (_sha, target) => {
        // Lands after the round that asked for it is over.
        await new Promise((resolve) => setTimeout(resolve, 300));
        driver.exec("UPDATE files SET local_path = '/here/a.pdf' WHERE entity_id = ?", target.pk);
        return "/here/a.pdf";
      },
      remove: async () => false,
    };
    const second = runtime(server, driver, undefined, platform);
    await second.sync.signIn("https://sync.example.com", "ada", "a long password");
    await second.sync.settled();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(driver.rows("SELECT local_path FROM files")).toEqual([{ local_path: "/here/a.pdf" }]);
    expect(await second.sync.engine.pendingCount()).toBe(0);
    second.sync.stop();
  });
});

describe("two-factor", () => {
  it("is asked for after the password, and the sign in finishes with the code", async () => {
    const { sync, account } = runtime();
    account.secondStep = ["totp", "email", "backup"];
    const attempt = await sync.signIn(PRODUCTION_SERVER, "ada", "a long password").catch((e) => e);
    expect(attempt).toBeInstanceOf(TwoFactorRequiredError);
    expect(attempt.challenge).toBe("challenge-1");
    expect(sync.store.getState().user).toBeNull();
    expect(account.signedIn).toBe(false);

    const user = await sync.completeTwoFactor(PRODUCTION_SERVER, "challenge-1", "totp", "123456");
    expect(user.username).toBe("ada");
    expect(account.calls).toContain("verify challenge-1 totp 123456 macos");
    expect(sync.store.getState().user?.username).toBe("ada");
    sync.stop();
  });

  it("leaves the device signed out when the code is wrong, so it can be tried again", async () => {
    const { sync, account } = runtime();
    account.secondStep = ["totp"];
    await sync.signIn(PRODUCTION_SERVER, "ada", "pw").catch(() => {});
    await expect(
      sync.completeTwoFactor(PRODUCTION_SERVER, "challenge-1", "totp", "000000"),
    ).rejects.toThrow("That code isn't right.");
    expect(sync.store.getState().user).toBeNull();
    await sync.completeTwoFactor(PRODUCTION_SERVER, "challenge-1", "totp", "123456");
    expect(sync.store.getState().user?.username).toBe("ada");
    sync.stop();
  });

  it("emails a code for a challenge on the server it came from", async () => {
    const { sync, account } = runtime();
    await sync.sendTwoFactorEmail(PRODUCTION_SERVER, "challenge-1");
    expect(account.calls).toContain("sendTwoFactorEmail challenge-1");
  });

  it("holds sync back for an account that owes it, until it is set up", async () => {
    const { sync, account, driver } = runtime();
    account.user = { ...ADA, termsVersion: TERMS_VERSION, twoFactorRequired: true };
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    expect(sync.store.getState().twoFactorPending).toBe(true);
    expect(driver.rows("SELECT * FROM sync_meta WHERE key = 'enabled'")).toEqual([]);
    expect(account.calls).not.toContain("push");

    account.user = { ...account.user, twoFactorRequired: false };
    await sync.twoFactorChanged();
    expect(sync.store.getState().twoFactorPending).toBe(false);
    expect(driver.rows("SELECT * FROM sync_meta WHERE key = 'enabled'")).not.toEqual([]);
    sync.stop();
  });

  it("holds a syncing device back as soon as the server asks for it", async () => {
    const { sync, account, driver } = runtime();
    account.user = { ...ADA, termsVersion: TERMS_VERSION };
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    // The server starts requiring it while this device is signed in.
    account.user = { ...account.user, twoFactorRequired: true };
    account.owesTwoFactor = true;
    account.liveHandlers?.onChanges();
    await vi.waitFor(() => expect(sync.store.getState().twoFactorPending).toBe(true));
    expect(account.liveHandlers).toBeNull();
    // Signed in still, with everything on the device.
    expect(sync.store.getState().user?.username).toBe("ada");
    expect(account.signedIn).toBe(true);
    expect(driver.rows("SELECT * FROM sync_meta WHERE key = 'enabled'")).not.toEqual([]);

    account.user = { ...account.user, twoFactorRequired: false };
    account.owesTwoFactor = false;
    await sync.twoFactorChanged();
    await vi.waitFor(() => expect(account.liveHandlers).not.toBeNull());
    sync.stop();
  });

  it("does not hold back an account that does not owe it", async () => {
    const { sync, account } = runtime();
    account.user = { ...ADA, termsVersion: TERMS_VERSION };
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    expect(sync.store.getState().twoFactorPending).toBe(false);
    sync.stop();
  });
});

describe("signing in with another account", () => {
  /// A browser that signs in and goes back to the app with this address.
  function withBrowser(returned: string | null, port: number | null = null) {
    const opened: string[] = [];
    const made = runtime();
    const sync = new SyncRuntime({
      driver: made.driver,
      connect: (_url, onSignedOut) => {
        made.account.onSignedOut = onSignedOut;
        return made.account;
      },
      device: { name: "iPhone", platform: "ios" },
      onApplied: made.onApplied,
      providerBrowser: async (begin) => {
        opened.push(await begin(port));
        return returned;
      },
    });
    return { ...made, sync, opened };
  }

  it("opens the provider's address in the browser and swaps the code it brings back", async () => {
    const { sync, account, opened } = withBrowser("nookly://auth?code=abc123");
    const user = await sync.signInWithProvider(PRODUCTION_SERVER, "github");
    expect(user?.username).toBe("ada");
    expect(opened).toEqual(["https://accounts.example/github"]);
    // The secret the server handed out goes back with the code, from this device.
    expect(account.calls).toContain("finish abc123 the-apps-secret ios");
    expect(sync.store.getState().user?.username).toBe("ada");
    sync.stop();
  });

  it("tells the server which loopback port a desktop listens on, and asks for an account only when told to", async () => {
    const { sync, account } = withBrowser("http://127.0.0.1:51423/auth?code=abc", 51423);
    await sync.signInWithProvider(PRODUCTION_SERVER, "google", {
      createAccount: true,
      betaKey: "key",
    });
    expect(account.begun).toEqual([
      { provider: "google", port: 51423, betaKey: "key", createAccount: true },
    ]);
    sync.stop();
  });

  it("confirms with the provider the account signs in with, through the same browser", async () => {
    const { sync, account, opened } = withBrowser("http://127.0.0.1:51423/auth?code=abc", 51423);
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    expect(await sync.confirmWithProvider("notion")).toBe(true);
    expect(opened).toEqual(["https://accounts.example/confirm/notion"]);
    expect(account.confirmations).toEqual([{ provider: "notion", port: 51423 }]);
    expect(account.calls).toContain("confirm abc confirm-secret");
    // Nothing about who is signed in changes.
    expect(sync.store.getState().user?.username).toBe("ada");
    sync.stop();
  });

  it("is not a confirmation when the browser is closed without finishing", async () => {
    const { sync, account } = withBrowser(null);
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    expect(await sync.confirmWithProvider("notion")).toBe(false);
    expect(account.calls.some((call) => call.startsWith("confirm "))).toBe(false);
    sync.stop();
  });

  it("says why the provider turned the confirmation down", async () => {
    const { sync } = withBrowser("nookly://auth?error=access_denied");
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    await expect(sync.confirmWithProvider("notion")).rejects.toThrow("Notion didn't allow");
    sync.stop();
  });

  it("needs a signed in account", async () => {
    const { sync } = withBrowser("nookly://auth?code=abc");
    await expect(sync.confirmWithProvider("notion")).rejects.toThrow("Sign in first");
    sync.stop();
  });

  it("does nothing when the browser is closed without finishing", async () => {
    const { sync, account } = withBrowser(null);
    expect(await sync.signInWithProvider(PRODUCTION_SERVER, "google")).toBeNull();
    expect(account.signedIn).toBe(false);
    expect(sync.store.getState().user).toBeNull();
  });

  it("says why when the provider or the server turned the sign in down", async () => {
    const { sync, account } = withBrowser("nookly://auth?error=signup_disabled");
    await expect(sync.signInWithProvider(PRODUCTION_SERVER, "github")).rejects.toThrow(
      "no Nookly account for this GitHub account yet",
    );
    expect(account.signedIn).toBe(false);
    const garbled = withBrowser("nookly://auth");
    await expect(garbled.sync.signInWithProvider(PRODUCTION_SERVER, "notion")).rejects.toThrow(
      "Signing in with Notion didn't work",
    );
  });

  it("tells apart a sign in that found no account, so the app can offer to make one", async () => {
    const { sync } = withBrowser("nookly://auth?error=signup_disabled");
    await expect(sync.signInWithProvider(PRODUCTION_SERVER, "google")).rejects.toBeInstanceOf(
      ProviderNoAccountError,
    );
  });

  it("records the terms the person agreed to with a new account, without telling the server's begin call", async () => {
    const { sync, account } = withBrowser("nookly://auth?code=abc");
    await sync.signInWithProvider(PRODUCTION_SERVER, "google", {
      createAccount: true,
      betaKey: "key",
      termsVersion: TERMS_VERSION,
    });
    expect(account.calls).toContain(`acceptTerms ${TERMS_VERSION}`);
    expect(account.begun).toEqual([{ provider: "google", betaKey: "key", createAccount: true }]);
    sync.stop();
  });

  it("passes on a code the server no longer takes", async () => {
    const { sync, account } = withBrowser("nookly://auth?code=stale");
    await expect(sync.signInWithProvider(PRODUCTION_SERVER, "google")).rejects.toThrow("expired");
    expect(account.signedIn).toBe(false);
  });

  it("is not offered on a device that cannot open a browser", async () => {
    const { sync } = runtime();
    await expect(sync.signInWithProvider(PRODUCTION_SERVER, "google")).rejects.toThrow(
      "isn't available",
    );
  });

  it("starts sync like any sign in, and asks for the terms of Nookly's own server", async () => {
    const { sync } = withBrowser("nookly://auth?code=abc");
    await sync.signInWithProvider(PRODUCTION_SERVER, "google");
    expect(sync.store.getState().termsPending).toBe(true);
    sync.stop();
  });

  it("keeps the username the person picks afterwards", async () => {
    const { sync, account, driver } = withBrowser("nookly://auth?code=abc");
    account.user = { ...ADA, username: "Ada Lovelace", needsUsername: true };
    await sync.signInWithProvider(PRODUCTION_SERVER, "github");
    expect(sync.store.getState().user?.needsUsername).toBe(true);
    await sync.chooseUsername("ada_l");
    expect(sync.store.getState().user).toMatchObject({ username: "ada_l", needsUsername: false });
    const saved = driver.rows("SELECT value FROM sync_meta WHERE key = 'user'");
    expect(JSON.parse(String(saved[0]?.value)).username).toBe("ada_l");
    sync.stop();
  });

  it("connects a provider to the signed in account through the same browser", async () => {
    const { sync, account, opened } = withBrowser("nookly://auth?code=abc");
    await sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    const change = await sync.linkProvider("notion");
    expect(opened).toEqual(["https://accounts.example/link/notion"]);
    expect(account.calls).toContain("link abc link-secret");
    expect(change?.methods.map((m) => m.provider)).toContain("notion");
    sync.stop();
  });

  it("connects nothing when the browser is closed, and says why when the provider refused", async () => {
    const closed = withBrowser(null);
    await closed.sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    expect(await closed.sync.linkProvider("notion")).toBeNull();
    closed.sync.stop();
    const refused = withBrowser("nookly://auth?error=access_denied");
    await refused.sync.signIn(PRODUCTION_SERVER, "ada", "a long password");
    await expect(refused.sync.linkProvider("notion")).rejects.toThrow("Notion didn't allow");
    refused.sync.stop();
  });

  it("disconnects a provider and stays signed in", async () => {
    const { sync, account } = runtime();
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    const change = await sync.disconnectProvider("github");
    expect(change.signedOut).toBe(false);
    expect(account.calls).toContain("unlink github live");
    expect(sync.store.getState().user?.username).toBe("ada");
    sync.stop();
  });

  it("keeps everything on the device when disconnecting signs it out", async () => {
    const { sync, account, driver } = runtime();
    addSpace(driver);
    account.current = "github";
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    const change = await sync.disconnectProvider("github");
    expect(change.signedOut).toBe(true);
    // Sync stopped first: nothing was asking while the session ended.
    expect(account.calls).toContain("unlink github quiet");
    expect(sync.store.getState()).toMatchObject({ user: null, signedOutReason: null });
    expect(driver.rows("SELECT id FROM spaces")).toEqual([{ id: "s1" }]);
  });

  it("goes on syncing when disconnecting is refused", async () => {
    const { sync, account } = runtime();
    account.current = "github";
    account.unlinkFails = true;
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await expect(sync.disconnectProvider("github")).rejects.toThrow("stays");
    await vi.waitFor(() => expect(account.liveHandlers).not.toBeNull());
    sync.stop();
  });

  it("asks a server which providers it has without touching the account", async () => {
    const { sync, account } = runtime();
    expect(await sync.providersOf("https://sync.example.com")).toEqual([
      "google",
      "github",
      "notion",
    ]);
    account.offered = [];
    expect(await sync.providersOf("sync.example.com")).toEqual([]);
    expect(sync.store.getState().serverUrl).toBeNull();
  });

  it("gives up waiting for the browser when the person cancels", async () => {
    const cancelled = vi.fn();
    const made = runtime();
    const sync = new SyncRuntime({
      driver: made.driver,
      connect: () => made.account,
      device: { name: "Mac", platform: "macos" },
      onApplied: made.onApplied,
      providerBrowser: async () => null,
      cancelProviderBrowser: cancelled,
    });
    sync.cancelProviderSignIn();
    expect(cancelled).toHaveBeenCalledOnce();
  });
});

/// A disk and the account's storage, for files that come and go with a sign in.
class DiskFiles implements BlobPlatform {
  readonly disk = new Map<string, string>();
  readonly store = new Map<string, string>();
  /// Paths whose upload never gets through.
  readonly stuck = new Set<string>();
  /// What an upload of a path waits for, to look at it while it is on its way.
  readonly gates = new Map<string, (onSent?: (bytes: number) => void) => Promise<void>>();
  driver = new NodeSqliteDriver();

  async hash(path: string) {
    const body = this.disk.get(path);
    return body === undefined ? null : { sha256: sha(body), size: body.length };
  }
  async size(path: string) {
    return this.disk.get(path)?.length ?? null;
  }
  async upload(
    sha256: string,
    path: string,
    _contentType?: string,
    onSent?: (bytes: number) => void,
  ) {
    if (this.stuck.has(path)) throw new Error("offline");
    await this.gates.get(path)?.(onSent);
    this.store.set(sha256, this.disk.get(path) ?? "");
  }
  async download(sha256: string, target: BlobTarget) {
    const body = this.store.get(sha256);
    if (body === undefined) throw new Error("missing");
    const path = `/nookly/files/${target.pk}`;
    this.disk.set(path, body);
    this.driver.exec("UPDATE files SET local_path = ? WHERE entity_id = ?", path, target.pk);
    return path;
  }
  async remove(path: string, sha256: string) {
    const body = this.disk.get(path);
    if (body === undefined || sha(body) !== sha256) return false;
    return this.disk.delete(path);
  }
}

describe("files and signing out", () => {
  function withFiles() {
    const files = new DiskFiles();
    const made = runtime(undefined, files.driver, async () => ({ path: "/b" }), files);
    addSpace(files.driver);
    return { ...made, files };
  }

  function addFile(files: DiskFiles, id: string, path: string, body: string, key: number) {
    files.disk.set(path, body);
    files.driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 's1', 'file', ?, ?, ?, 'FIL', ?)",
      id,
      id,
      now(),
      now(),
      key,
    );
    files.driver.exec(
      "INSERT INTO files (entity_id, local_path, original_filename) VALUES (?, ?, 'a.pdf')",
      id,
      path,
    );
  }

  async function signedIn(made: ReturnType<typeof withFiles>) {
    await made.sync.signIn("https://sync.example.com", "ada", "a long password");
    await settle(made.sync);
  }

  /// Files go in the background after a round, and their hashes in the round after it.
  async function settle(sync: SyncRuntime<FakeAccount>) {
    await sync.settled();
    await sync.settled();
  }

  it("shows how far a big file of the first sync has got", async () => {
    const made = withFiles();
    addFile(made.files, "small", "/nookly/files/small", "12345", 1);
    addFile(made.files, "big", "/nookly/files/big", "x".repeat(100), 2);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    made.files.gates.set("/nookly/files/big", async (onSent) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      onSent?.(40);
      await held;
    });
    await made.sync.signIn("https://sync.example.com", "ada", "a long password");
    await vi.waitFor(() =>
      expect(made.sync.store.getState().migration).toMatchObject({
        phase: "sending",
        files: 2,
        fileBytes: 105,
        filesSent: 1,
        fileBytesSent: 45,
      }),
    );
    release();
    await settle(made.sync);
    expect(made.sync.store.getState().migration).toMatchObject({
      phase: "done",
      filesSent: 2,
      fileBytesSent: 105,
    });
    made.sync.stop();
  });

  it("finishes the first sync when a file is gone from disk", async () => {
    const made = withFiles();
    addFile(made.files, "f1", "/nookly/files/a", "lecture", 1);
    made.files.disk.clear();
    await signedIn(made);
    expect(made.sync.store.getState().migration).toMatchObject({ phase: "done", files: 0 });
    made.sync.stop();
  });

  it("brings the files back after signing out and in again", async () => {
    const made = withFiles();
    addFile(made.files, "f1", "/nookly/files/a", "lecture", 1);
    await signedIn(made);
    await made.sync.signOut();
    await signedIn(made);
    expect(made.files.disk.get("/nookly/files/f1")).toBe("lecture");
    made.sync.stop();
  });

  it("brings back a file an earlier version left a stale record of", async () => {
    const made = withFiles();
    addFile(made.files, "f1", "/nookly/files/a", "lecture", 1);
    await signedIn(made);
    made.files.driver.exec("UPDATE files SET local_path = NULL");
    await made.sync.syncNow();
    await settle(made.sync);
    expect(made.files.disk.get("/nookly/files/f1")).toBe("lecture");
    made.sync.stop();
  });

  it("sends the files of a local copy to the account it joins next", async () => {
    const made = withFiles();
    addFile(made.files, "f1", "/nookly/files/a", "lecture", 1);
    await signedIn(made);
    await made.sync.signOut({ keepLocalCopy: true });
    // Another account: nothing of this device's is there.
    made.server.records.clear();
    made.files.store.clear();
    await signedIn(made);
    expect(made.files.store.get(sha("lecture"))).toBe("lecture");
    made.sync.stop();
  });

  it("doesn't send files again to the account that still has them", async () => {
    const made = withFiles();
    made.account.hasBlob = async (sha256) => made.files.store.has(sha256);
    const sent = vi.spyOn(made.files, "upload");
    addFile(made.files, "f1", "/nookly/files/a", "lecture", 1);
    await signedIn(made);
    await made.sync.signOut({ keepLocalCopy: true });
    sent.mockClear();
    await signedIn(made);
    expect(sent).not.toHaveBeenCalled();
    made.sync.stop();
  });

  it("removes the files the account has, and keeps the ones it doesn't", async () => {
    const made = withFiles();
    const { files } = made;
    files.stuck.add("/nookly/files/unsent");
    addFile(files, "sent", "/nookly/files/sent", "in the account", 1);
    addFile(files, "edited", "/nookly/files/edited", "as uploaded", 2);
    addFile(files, "unsent", "/nookly/files/unsent", "only here", 3);
    await signedIn(made);
    files.disk.set("/nookly/files/edited", "changed on disk since");
    await made.sync.signOut();
    expect([...files.disk.keys()].sort()).toEqual(["/nookly/files/edited", "/nookly/files/unsent"]);
  });

  it("keeps a file another item still needs here", async () => {
    const made = withFiles();
    const { files } = made;
    addFile(files, "f1", "/nookly/files/shared", "same", 1);
    await signedIn(made);
    files.stuck.add("/nookly/files/shared");
    addFile(files, "f2", "/nookly/files/shared", "same", 2);
    await made.sync.signOut();
    expect(files.disk.has("/nookly/files/shared")).toBe(true);
  });

  it("removes nothing when a local copy is kept", async () => {
    const made = withFiles();
    addFile(made.files, "f1", "/nookly/files/a", "lecture", 1);
    await signedIn(made);
    await made.sync.signOut({ keepLocalCopy: true });
    expect(made.files.disk.get("/nookly/files/a")).toBe("lecture");
  });

  /// What version 1.0.3 leaves on a device that moved to another account: a file recorded as
  /// sent, which the account it is in now may never have got.
  function addRecordedFile(files: DiskFiles, id: string, path: string, body: string) {
    addFile(files, id, path, body, 1);
    files.driver.exec("UPDATE files SET blob = ? WHERE entity_id = ?", sha(body), id);
    files.driver.exec(
      "INSERT INTO blob_files (tbl, pk, path, sha256) VALUES ('files', ?, ?, ?)",
      id,
      path,
      sha(body),
    );
  }

  /// `withFiles`, with an account that says truthfully which contents it holds.
  function withAccountFiles() {
    const made = withFiles();
    const asked = vi.fn(async (sha256: string) => made.files.store.has(sha256));
    made.account.hasBlob = asked;
    return { ...made, asked };
  }

  const unreachable = async (): Promise<boolean> => {
    throw new NetworkError("Can't reach the server.");
  };

  it("sends a file an earlier version recorded as sent that the account never got", async () => {
    const made = withAccountFiles();
    addRecordedFile(made.files, "f1", "/nookly/files/a", "only copy");
    await signedIn(made);
    expect(made.files.store.get(sha("only copy"))).toBe("only copy");
    made.sync.stop();
  });

  it("keeps a recorded file, and backs up first, while the account can't be asked", async () => {
    const made = withAccountFiles();
    made.account.hasBlob = unreachable;
    addRecordedFile(made.files, "f1", "/nookly/files/a", "only copy");
    await signedIn(made);
    await expect(made.sync.signOut()).resolves.toMatchObject({ backupPath: "/b" });
    expect(made.files.disk.get("/nookly/files/a")).toBe("only copy");
  });

  it("keeps a recorded file when the server signs the device out before asking", async () => {
    const made = withAccountFiles();
    made.account.hasBlob = unreachable;
    addRecordedFile(made.files, "f1", "/nookly/files/a", "only copy");
    await signedIn(made);
    made.account.onSignedOut();
    await vi.waitFor(() => expect(made.sync.store.getState().user).toBeNull());
    await vi.waitFor(() => expect(made.reindex).toHaveBeenCalled());
    expect(made.files.disk.get("/nookly/files/a")).toBe("only copy");
  });

  it("removes a recorded file on sign out once the account says it has it", async () => {
    const made = withAccountFiles();
    const sent = vi.spyOn(made.files, "upload");
    made.files.store.set(sha("in the account"), "in the account");
    addRecordedFile(made.files, "f1", "/nookly/files/a", "in the account");
    await signedIn(made);
    expect(sent).not.toHaveBeenCalled();
    await made.sync.signOut();
    expect(made.files.disk.has("/nookly/files/a")).toBe(false);
  });

  it("asks the account about a file once", async () => {
    const made = withAccountFiles();
    made.files.store.set(sha("in the account"), "in the account");
    addRecordedFile(made.files, "f1", "/nookly/files/a", "in the account");
    await signedIn(made);
    made.asked.mockClear();
    await made.sync.syncNow();
    await settle(made.sync);
    expect(made.asked).not.toHaveBeenCalled();
    made.sync.stop();
  });

  it("stops waiting for a recorded file that is gone here and in the account", async () => {
    const made = withAccountFiles();
    made.files.store.set(sha("in the account"), "in the account");
    addRecordedFile(made.files, "f1", "/nookly/files/a", "in the account");
    made.files.disk.clear();
    await signedIn(made);
    expect(made.sync.store.getState().files).toMatchObject({ toUpload: 0 });
    await expect(made.sync.unsentCount()).resolves.toBe(0);
    made.sync.stop();
  });

  it("doesn't count a file that arrives after the account is gone for the next one", async () => {
    const made = withAccountFiles();
    const { files } = made;
    let release = () => {};
    const waits = new Promise<void>((resolve) => {
      release = resolve;
    });
    files.gates.set("/nookly/files/a", () => waits);
    addFile(files, "f1", "/nookly/files/a", "lecture", 1);
    await made.sync.signIn("https://sync.example.com", "ada", "a long password");
    await made.sync.syncNow();
    // The account is deleted while the file is on its way.
    await made.sync.detach();
    release();
    await vi.waitFor(() =>
      expect(files.driver.rows("SELECT sha256 FROM blob_files")).toHaveLength(1),
    );
    // The next account has nothing of this device's, and never gets the file.
    made.server.records.clear();
    files.store.clear();
    files.gates.clear();
    files.stuck.add("/nookly/files/a");
    await signedIn(made);
    await made.sync.signOut();
    expect(files.disk.get("/nookly/files/a")).toBe("lecture");
  });

  it("removes the files the account has when the server signs the device out", async () => {
    const made = withFiles();
    const { files } = made;
    files.stuck.add("/nookly/files/unsent");
    addFile(files, "sent", "/nookly/files/sent", "in the account", 1);
    addFile(files, "unsent", "/nookly/files/unsent", "only here", 2);
    await signedIn(made);
    made.account.onSignedOut();
    await vi.waitFor(() => expect(files.disk.has("/nookly/files/sent")).toBe(false));
    expect(files.disk.has("/nookly/files/unsent")).toBe(true);
  });
});
