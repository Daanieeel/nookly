import type { ApiClient, DeviceInfo, User } from "@nookly/shared/api";
import { type SqlDriver, SyncClient, SyncEngine, type SyncStatus } from "@nookly/shared/sync";
import { createStore } from "zustand/vanilla";

/// Sync on this device: which server and account, the engine on this device's
/// database and the client that keeps it in step. Sync is optional; nothing here
/// runs until someone signs in.

/// The account calls sync needs; the shared `ApiClient` is one.
export type AccountApi = Pick<
  ApiClient,
  "register" | "signIn" | "signOut" | "me" | "isSignedIn" | "syncTransport"
>;

export interface SyncRuntimeDeps<A extends AccountApi> {
  driver: SqlDriver;
  /// An API client for a server, told when the server signs this device out.
  connect: (serverUrl: string, onSignedOut: () => void) => A;
  device: DeviceInfo;
  /// Rebuilds search and mentions for entities that changed elsewhere.
  reindex: (entityIds: string[]) => Promise<void>;
  /// Remote changes landed; views refresh.
  onApplied: () => void;
}

export interface SyncState {
  serverUrl: string | null;
  user: User | null;
  status: SyncStatus;
  /// Set when the server signed this device out (a password reset, a removed session).
  signedOutReason: string | null;
}

const OFF: SyncStatus = {
  state: "off",
  pending: 0,
  conflicts: 0,
  parked: 0,
  lastSyncedAt: null,
  error: null,
};

/// A server address without a trailing slash, so one server is one address.
export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export class SyncRuntime<A extends AccountApi = AccountApi> {
  readonly store = createStore<SyncState>(() => ({
    serverUrl: null,
    user: null,
    status: OFF,
    signedOutReason: null,
  }));
  readonly engine: SyncEngine;
  private readonly deps: SyncRuntimeDeps<A>;
  private api: A | null = null;
  private client: SyncClient | null = null;

  constructor(deps: SyncRuntimeDeps<A>) {
    this.deps = deps;
    this.engine = new SyncEngine({ driver: deps.driver, afterApply: deps.reindex });
  }

  /// The account API while signed in, for sessions, sharing and the account itself.
  account(): A | null {
    return this.api;
  }

  private connect(serverUrl: string): A {
    const url = normalizeServerUrl(serverUrl);
    this.store.setState({ serverUrl: url });
    this.api = this.deps.connect(url, () => void this.signedOutByServer());
    return this.api;
  }

  /// On launch: carries on with the saved sign in, if there is one.
  async restore(serverUrl: string | null): Promise<void> {
    if (!serverUrl) return;
    const api = this.connect(serverUrl);
    if (!(await api.isSignedIn())) return;
    try {
      this.store.setState({ user: await api.me() });
    } catch {
      // Offline at launch: sync starts anyway and catches up when the server is back.
    }
    await this.start();
  }

  async signUp(serverUrl: string, email: string, password: string): Promise<User> {
    const user = await this.connect(serverUrl).register(email, password, this.deps.device);
    this.store.setState({ user, signedOutReason: null });
    await this.start();
    return user;
  }

  async signIn(serverUrl: string, email: string, password: string): Promise<User> {
    const user = await this.connect(serverUrl).signIn(email, password, this.deps.device);
    this.store.setState({ user, signedOutReason: null });
    await this.start();
    return user;
  }

  private async start() {
    if (!this.api || this.client) return;
    this.client = new SyncClient({
      engine: this.engine,
      transport: this.api.syncTransport(),
      onStatus: (status) => this.store.setState({ status }),
      onApplied: this.deps.onApplied,
    });
    await this.client.start();
  }

  stop() {
    this.client?.stop();
    this.client = null;
  }

  syncNow(): Promise<void> {
    return this.client?.syncNow() ?? Promise.resolve();
  }

  notifyLocalChange() {
    this.client?.notifyLocalChange();
  }

  /// Signs this device out. Every row stays; only what the device knew of the server
  /// goes, so signing in again (to this or another account) is a safe first sync.
  async signOut(): Promise<void> {
    this.stop();
    try {
      await this.api?.signOut();
    } catch {
      // Offline: the server ends the session when its tokens run out.
    }
    await this.engine.disable();
    this.store.setState({ user: null, status: OFF });
  }

  private async signedOutByServer() {
    this.stop();
    await this.engine.disable();
    this.store.setState({
      user: null,
      status: OFF,
      signedOutReason: "This device was signed out of sync. Sign in again to keep syncing.",
    });
  }
}
