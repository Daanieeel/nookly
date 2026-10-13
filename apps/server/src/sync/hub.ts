import type { ServerMessage } from "@nookly/shared/sync";

export interface LiveSocket {
  send(message: string): void;
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

  connected(userId: string): number {
    return this.sockets.get(userId)?.size ?? 0;
  }
}
