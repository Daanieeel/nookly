import {
  type LocalDb,
  addFile,
  createBookmark,
  recents,
  search,
  titleFromUrl,
} from "@nookly/shared/data";
import { blockRequest, mentionRows } from "./block-bridge.ts";

/// The phone's side of the blocks' bridge: what the editor asks for, answered from the phone's
/// own data, as JSON.

export interface BlockEnv {
  db: LocalDb;
  /// The page the block is in, left out of what it can point at.
  entityId: string;
  /// The page's Space, where files and bookmarks it makes are kept; null while it is not known.
  spaceId: string | null;
  /// Runs a write to the phone's data, so views refresh and sync is told.
  write: (change: (db: LocalDb) => Promise<string>) => Promise<string>;
  /// Asks for a file from the phone's Files app, kept in the app's folder; null when none was picked.
  pick: () => Promise<{ name: string; uri: string } | null>;
}

const MAX_FOUND = 8;

export async function answerBlockRequest(raw: string, env: BlockEnv): Promise<string> {
  const request = blockRequest.safeParse(JSON.parse(raw));
  if (!request.success) return JSON.stringify({ error: "That was not understood." });
  const asked = request.data;
  if (asked.op === "search") {
    const types = asked.types;
    const found = asked.query.trim()
      ? await search(env.db, asked.query, { types }, MAX_FOUND + 1)
      : (await recents(env.db, 60)).filter((e) => types.length === 0 || types.includes(e.type));
    return JSON.stringify(
      found
        .filter((e) => e.id !== env.entityId)
        .slice(0, MAX_FOUND)
        .map((e) => ({ id: e.id, title: e.title, key: e.key })),
    );
  }
  if (env.spaceId === null) {
    return JSON.stringify({ error: "This page is not in a Space yet." });
  }
  const spaceId = env.spaceId;
  try {
    if (asked.op === "upload") {
      const picked = await env.pick();
      if (!picked) return JSON.stringify({ canceled: true });
      const id = await env.write((db) => addFile(db, spaceId, picked.name, picked.uri));
      return JSON.stringify({ rows: mentionRows(picked.name, id) });
    }
    const url = asked.url.trim();
    const id = await env.write((db) => createBookmark(db, spaceId, url));
    return JSON.stringify({ rows: mentionRows(titleFromUrl(url), id) });
  } catch {
    return JSON.stringify({
      error:
        asked.op === "upload"
          ? "Couldn't add the file, try again"
          : "Couldn't add the bookmark, try again",
    });
  }
}
