import { z } from "zod";
import type { Connection, MoodleApi } from "./api.ts";
import { launchUrl, parseCallback, parseSite, signatureMatches } from "./login.ts";

/// This phone's Moodle sign in, as the desktop keeps its own (`moodle/service.rs`): the
/// site and token in the keychain, never in the synced data, since a token is per device.

const CONNECTION = "moodle.connection";
const PENDING = "moodle.pending";
/// How long a sign in started here waits for Moodle to send the person back.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const SCHEME = "nookly";

/// Where the sign in is kept: the keychain, or a faithful stand in for tests.
export interface KeyStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface AccountDeps {
  keys: KeyStore;
  api: MoodleApi;
  md5: (text: string) => Promise<string>;
  uuid: () => string;
  now?: () => number;
}

const connectionSchema = z.object({
  site: z.object({ root: z.string() }),
  token: z.string(),
  userId: z.number(),
  siteName: z.string(),
  fullName: z.string(),
});
const pendingSchema = z.object({ root: z.string(), passport: z.string(), started: z.number() });

export function moodleAccount({ keys, api, md5, uuid, now = Date.now }: AccountDeps) {
  async function read<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
    const raw = await keys.getItemAsync(key);
    if (!raw) return null;
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  return {
    load: () => read(CONNECTION, connectionSchema),

    /// Starts a sign in: remembers the passport for the site and gives the page to open.
    async begin(input: string): Promise<string> {
      const site = parseSite(input);
      const passport = uuid().replace(/-/g, "");
      await keys.setItemAsync(
        PENDING,
        JSON.stringify({ root: site.root, passport, started: now() }),
      );
      return launchUrl(site, passport, SCHEME);
    },

    /// Finishes the sign in with what Moodle sent back to `nookly://`, after checking it is
    /// the one started here.
    async finish(link: string): Promise<Connection> {
      const pending = await read(PENDING, pendingSchema);
      await keys.deleteItemAsync(PENDING);
      if (!pending || now() - pending.started > LOGIN_WINDOW_MS) {
        throw new Error("No Moodle sign in is waiting. Start it again from Nookly.");
      }
      const { signature, token } = parseCallback(link);
      const site = { root: pending.root };
      const info = await api.siteInfo(site, token);
      if (
        !(await signatureMatches(signature, [pending.root, info.siteurl], pending.passport, md5))
      ) {
        throw new Error("That sign in did not start from Nookly, so it was ignored.");
      }
      const connection: Connection = {
        site,
        token,
        userId: info.userid,
        siteName: info.sitename || new URL(pending.root).host,
        fullName: info.fullname,
      };
      await keys.setItemAsync(CONNECTION, JSON.stringify(connection));
      return connection;
    },

    /// Forgets the site and the token on this phone.
    async disconnect(): Promise<void> {
      await keys.deleteItemAsync(CONNECTION);
      await keys.deleteItemAsync(PENDING);
    },
  };
}

export type MoodleAccount = ReturnType<typeof moodleAccount>;
