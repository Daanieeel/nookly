import type { InvokeArgs } from "@tauri-apps/api/core";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";

/// A fake Tauri backend for tests, installed through Tauri's own IPC mock (the same
/// seam `invoke`, events and every plugin go through), so no module is replaced.
/// Register a canned reply per command with `mockCommand`, then assert on `callsOf`.
/// A command without a reply rejects, so a test never passes on a call it didn't expect.

/// What a command replies with: a record, a list or a plain value, as the backend sends.
export type Reply = object | string | number | boolean | null | undefined;

export interface InvokeCall {
  cmd: string;
  args: InvokeArgs | undefined;
}

type Handler = (args: InvokeArgs | undefined) => Reply | Promise<Reply>;

const handlers = new Map<string, Handler>();
const calls: InvokeCall[] = [];

/// Registers the value `cmd` replies with.
export function mockCommand<T extends Reply>(cmd: string, reply: T) {
  handlers.set(cmd, () => reply);
}

/// Registers a function of the call's arguments that answers `cmd`. Throwing (or
/// rejecting) from it makes the `invoke` reject.
export function mockCommandWith(cmd: string, handler: Handler) {
  handlers.set(cmd, handler);
}

/// Every call so far, oldest first.
export function invokeCalls(): InvokeCall[] {
  return [...calls];
}

/// The arguments of every call to `cmd`, oldest first.
export function callsOf(cmd: string): (InvokeArgs | undefined)[] {
  return calls.filter((c) => c.cmd === cmd).map((c) => c.args);
}

/// The command names called so far, oldest first.
export function calledCommands(): string[] {
  return calls.map((c) => c.cmd);
}

/// Installs a fresh fake backend: no replies, no recorded calls. Events (`listen`,
/// `emit`) are faked too, so subscribing never needs a reply.
export function installTauriMock() {
  handlers.clear();
  calls.length = 0;
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args });
      const handler = handlers.get(cmd);
      if (!handler) throw new Error(`No mocked reply for Tauri command "${cmd}"`);
      return handler(args);
    },
    { shouldMockEvents: true },
  );
}

export function uninstallTauriMock() {
  clearMocks();
  handlers.clear();
  calls.length = 0;
}
