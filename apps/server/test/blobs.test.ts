import { HeadObjectCommand, ListObjectVersionsCommand } from "@aws-sdk/client-s3";
import { retryAfterSeconds } from "@nookly/shared/api";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import { PHONE, type TestServer, account, startServer, HOOK_TIMEOUT } from "./helpers.ts";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
}, HOOK_TIMEOUT);
afterEach(async () => {
  await server.stop();
}, HOOK_TIMEOUT);

const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const bytesOf = (text: string) => new TextEncoder().encode(text);

async function put(token: string, hash: string, body: BodyInit, type = "text/plain") {
  return fetch(`${server.baseUrl}/v1/blobs/${hash}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": type },
    body,
  });
}

async function tokenOf(username: string) {
  const { api } = await account(server, username, PHONE);
  return (await api.sessionToken()) ?? "";
}

describe("file contents", () => {
  it("reads the whole body of a file it already holds, so the sender is not cut off mid upload", async () => {
    const { api } = await account(server, "bob");
    const body = bytesOf("the same lecture slides");
    const hash = sha256(body);
    await api.uploadBlob(hash, body, "text/plain");
    const owner = (await api.me()).id;
    let sent = 0;
    const chunks = 8;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === chunks) return controller.close();
        sent += 1;
        controller.enqueue(body);
      },
    });
    const outcome = await server.storage?.put(owner, hash, stream, "text/plain");
    expect(outcome).toBe("existing");
    expect(sent).toBe(chunks);
  });

  it("stores a file under its SHA-256 and gives it back unchanged", async () => {
    const { api } = await account(server, "ada");
    const body = bytesOf("lecture notes, page one");
    const hash = sha256(body);
    expect(await api.hasBlob(hash)).toBe(false);
    await api.uploadBlob(hash, body, "text/plain");
    expect(await api.hasBlob(hash)).toBe(true);
    const back = await api.downloadBlob(hash);
    expect(new TextDecoder().decode(back.bytes)).toBe("lecture notes, page one");
    expect(back.contentType).toBe("text/plain");
    const owner = (await api.me()).id;
    const head = await server.storage?.client.send(
      new HeadObjectCommand({
        Bucket: server.config.S3_BUCKET,
        Key: `blobs/${owner}/${hash}`,
        ChecksumMode: "ENABLED",
      }),
    );
    expect(head?.ChecksumSHA256).toBe(Buffer.from(hash, "hex").toString("base64"));
  });

  it("refuses a body that doesn't match its hash, and keeps nothing of it", async () => {
    const token = await tokenOf("ada");
    const claimed = sha256(bytesOf("what the device meant to send"));
    const response = await put(token, claimed, bytesOf("what arrived instead"));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("checksum_mismatch");
    const head = await fetch(`${server.baseUrl}/v1/blobs/${claimed}`, {
      method: "HEAD",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(head.status).toBe(404);
  });

  it("takes the same file twice without a second copy", async () => {
    const { api } = await account(server, "ada");
    const body = bytesOf("same bytes");
    const hash = sha256(body);
    await api.uploadBlob(hash, body, "text/plain");
    await api.uploadBlob(hash, body, "text/plain");
    const [row] = await server.sql`SELECT COUNT(*)::int AS n FROM blobs`;
    expect(row.n).toBe(1);
  });

  it("keeps nothing of an upload cut off halfway, and a retry works", async () => {
    const token = await tokenOf("ada");
    const body = bytesOf("x".repeat(64 * 1024));
    const hash = sha256(body);
    // A stream that dies after its first chunk, like a connection dropped mid upload.
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(body.slice(0, 1024));
        controller.error(new Error("connection lost"));
      },
    });
    await put(token, hash, broken).catch(() => null);
    const [none] = await server.sql`SELECT COUNT(*)::int AS n FROM blobs`;
    expect(none.n).toBe(0);
    expect((await put(token, hash, body)).status).toBe(201);
  });

  it("is only ever readable by its owner", async () => {
    const { api } = await account(server, "ada");
    const body = bytesOf("private");
    const hash = sha256(body);
    await api.uploadBlob(hash, body, "text/plain");
    const ben = await tokenOf("ben");
    const read = await fetch(`${server.baseUrl}/v1/blobs/${hash}`, {
      headers: { authorization: `Bearer ${ben}` },
    });
    expect(read.status).toBe(404);
    const anonymous = await fetch(`${server.baseUrl}/v1/blobs/${hash}`);
    expect(anonymous.status).toBe(401);
  });

  it("refuses a file over the size limit", async () => {
    server = await startServer({ MAX_BLOB_BYTES: "2048" });
    const token = await tokenOf("ada");
    const body = bytesOf("y".repeat(4096));
    const response = await put(token, sha256(body), body);
    expect(response.status).toBe(413);
  });

  it("refuses a hash that isn't one", async () => {
    const token = await tokenOf("ada");
    expect((await put(token, "not-a-hash", bytesOf("x"))).status).toBe(422);
  });

  it("deletes every stored version when the account is deleted", async () => {
    const { api } = await account(server, "ada");
    const owner = (await api.me()).id;
    const body = bytesOf("gone with the account");
    await api.uploadBlob(sha256(body), body, "text/plain");
    await api.deleteAccount("correct horse battery");
    const versions = await server.storage?.client.send(
      new ListObjectVersionsCommand({
        Bucket: server.config.S3_BUCKET,
        Prefix: `blobs/${owner}/`,
      }),
    );
    expect(versions?.Versions ?? []).toEqual([]);
    expect(versions?.DeleteMarkers ?? []).toEqual([]);
  });
});

describe("how many files move in a minute", () => {
  // The limit on everything else becomes 6 a minute, the one on files 30.
  beforeEach(async () => {
    await server.stop();
    server = await startServer({ RATE_LIMIT_SCALE: "0.01" });
  }, HOOK_TIMEOUT);

  const body = bytesOf("one lecture of many");
  const hash = sha256(body);
  const get = (token: string) =>
    fetch(`${server.baseUrl}/v1/blobs/${hash}`, {
      headers: { authorization: `Bearer ${token}` },
    });

  it("lets a first download through, and leaves sync what it had", async () => {
    const { api } = await account(server, "ada", PHONE);
    const token = (await api.sessionToken()) ?? "";
    expect((await put(token, hash, body)).status).toBe(201);
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const response = await get(token);
      await response.arrayBuffer();
      statuses.push(response.status);
    }
    expect(statuses).toEqual(Array.from({ length: 20 }, () => 200));
    await expect(api.syncTransport().pull({ cursors: {} })).resolves.toBeDefined();
  });

  it("still stops what asks without end, and says how long to wait", async () => {
    const token = await tokenOf("ada");
    expect((await put(token, hash, body)).status).toBe(201);
    let refused: Response | null = null;
    for (let i = 0; i < 40 && !refused; i++) {
      const response = await get(token);
      if (response.status === 429) refused = response;
      else await response.arrayBuffer();
    }
    const answer = z.object({ message: z.string() }).parse(await refused?.json());
    expect(retryAfterSeconds(answer.message)).toBeGreaterThan(0);
  });
});
