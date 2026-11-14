import { createHash } from "node:crypto";
import type { Http } from "./api.ts";
import { moodleApi } from "./api.ts";
import { moodleAccount } from "./connection.ts";

const md5 = async (text: string) => createHash("md5").update(text).digest("hex");

function account(now = () => 1000) {
  const keys = new Map<string, string>();
  const http: Http = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      sitename: "Uni Moodle",
      fullname: "Ada Lovelace",
      userid: 7,
      siteurl: "https://moodle.uni.edu",
    }),
  });
  const it = moodleAccount({
    keys: {
      getItemAsync: async (key) => keys.get(key) ?? null,
      setItemAsync: async (key, value) => void keys.set(key, value),
      deleteItemAsync: async (key) => void keys.delete(key),
    },
    api: moodleApi(http),
    md5,
    uuid: () => "pass-port",
    now,
  });
  return { keys, account: it };
}

const link = async (passport: string, token = "tok456") =>
  `nookly://token=${btoa(`${await md5(`https://moodle.uni.edu${passport}`)}:::${token}`)}`;

describe("a Moodle sign in on the phone", () => {
  it("keeps the token of the sign in started here", async () => {
    const { keys, account: moodle } = account();
    await moodle.begin("moodle.uni.edu");
    const connection = await moodle.finish(await link("passport"));
    expect(connection).toEqual({
      site: { root: "https://moodle.uni.edu" },
      token: "tok456",
      userId: 7,
      siteName: "Uni Moodle",
      fullName: "Ada Lovelace",
    });
    expect(await moodle.load()).toEqual(connection);
    expect(keys.has("moodle.pending")).toBe(false);
  });

  it("ignores a link that did not start here", async () => {
    const { account: moodle } = account();
    await moodle.begin("moodle.uni.edu");
    await expect(moodle.finish(await link("someone-else"))).rejects.toThrow(
      "That sign in did not start from Nookly, so it was ignored.",
    );
    expect(await moodle.load()).toBeNull();
  });

  it("ignores a link when no sign in is waiting, or it waited too long", async () => {
    const { account: idle } = account();
    await expect(idle.finish(await link("passport"))).rejects.toThrow(
      "No Moodle sign in is waiting",
    );
    let time = 0;
    const { account: late } = account(() => time);
    await late.begin("moodle.uni.edu");
    time = 16 * 60 * 1000;
    await expect(late.finish(await link("passport"))).rejects.toThrow(
      "No Moodle sign in is waiting",
    );
  });

  it("forgets the sign in on disconnect", async () => {
    const { account: moodle } = account();
    await moodle.begin("moodle.uni.edu");
    await moodle.finish(await link("passport"));
    await moodle.disconnect();
    expect(await moodle.load()).toBeNull();
  });
});
