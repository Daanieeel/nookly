import { afterEach, describe, expect, it } from "bun:test";
import { HOOK_TIMEOUT, type TestServer, startServer } from "./helpers.ts";

/// Behind a proxy every connection is the proxy's, so the live sockets are limited by the
/// address the proxy appended, like every other request.

let server: TestServer;
afterEach(async () => {
  await server.stop();
}, HOOK_TIMEOUT);

/// 60 sockets a minute, scaled down to 3.
const THREE = { RATE_LIMIT_SCALE: "0.05" };

/// Whether the server closes a socket as rate limited as soon as it opens.
async function limited(path: string, forwarded: string): Promise<boolean> {
  const url = `${server.baseUrl.replace("http", "ws")}${path}`;
  // @ts-expect-error Bun takes headers here; the DOM type only knows protocols.
  const socket = new WebSocket(url, { headers: { "x-forwarded-for": forwarded } });
  const reason = await new Promise<string | null>((resolve) => {
    socket.addEventListener("close", (event) => resolve(event.reason));
    socket.addEventListener("open", () => setTimeout(() => resolve(null), 150));
  });
  socket.close();
  return reason === "rate limited";
}

async function opens(path: string, addresses: string[]) {
  const results: boolean[] = [];
  for (const address of addresses) results.push(await limited(path, address));
  return results;
}

for (const path of ["/v1/sync/ws", "/v1/collab"]) {
  describe(`the limit on ${path}`, () => {
    it("counts each client behind the proxy on its own", async () => {
      server = await startServer({ ...THREE, TRUST_PROXY: "true" });
      expect(await opens(path, Array(4).fill("1.1.1.1"))).toEqual([false, false, false, true]);
      expect(await opens(path, ["2.2.2.2"])).toEqual([false]);
    });

    it("ignores an address the client wrote before the proxy's", async () => {
      server = await startServer({ ...THREE, TRUST_PROXY: "true" });
      const spoofed = [1, 2, 3, 4].map((n) => `9.9.9.${n}, 1.1.1.1`);
      expect(await opens(path, spoofed)).toEqual([false, false, false, true]);
    });

    it("does not read the header without a trusted proxy", async () => {
      server = await startServer(THREE);
      const rotated = ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"];
      expect(await opens(path, rotated)).toEqual([false, false, false, true]);
    });
  });
}
