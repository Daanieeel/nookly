import type { ServerMessage } from "@nookly/shared/sync";

export interface LiveSocket {
  send(message: string): void;
  /// Ends the connection, after its last message.
  close?(): void;
  /// The session that signed it in, so ending that session ends it too.
  sessionId?: string;
}

/// Who is connected live, per account, so a push can tell every device that cares.
/// In memory: the server is one process.
export class Hub {
  private readonly sockets = new Map<string, Set<LiveSocket>>();

  add(userId: string, socket: LiveSocket) {
    const set = this.sockets.get(userId) ?? new Set();
    set.add(socket);
    this.sockets.set(userId, set);
  }

  remove(userId: string, socket: LiveSocket) {
    const set = this.sockets.get(userId);
    set?.delete(socket);
    if (set?.size === 0) this.sockets.delete(userId);
  }

  notify(userId: string, message: ServerMessage) {
    const text = JSON.stringify(message);
    for (const socket of this.sockets.get(userId) ?? []) {
      try {
        socket.send(text);
      } catch {
        // A socket that just closed; its close handler removes it.
      }
    }
  }

  /// A session was ended (signed out from another device): its devices hear it at once
  /// and sign out, instead of on their next request.
  endSession(userId: string, sessionId: string) {
    const text = JSON.stringify({ type: "error", code: "unauthorized" } satisfies ServerMessage);
    for (const socket of [...(this.sockets.get(userId) ?? [])]) {
      if (socket.sessionId !== sessionId) continue;
      try {
        socket.send(text);
        socket.close?.();
      } catch {
        // Already closed.
      }
      this.remove(userId, socket);
    }
  }

  connected(userId: string): number {
    return this.sockets.get(userId)?.size ?? 0;
  }
}
