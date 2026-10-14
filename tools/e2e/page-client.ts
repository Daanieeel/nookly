/// Another device editing a page, for checking that edits reach the phone live:
///
///   bun tools/e2e/page-client.ts <server> <username> <password> <entity id> append " text"
///   bun tools/e2e/page-client.ts <server> <username> <password> <entity id> read
///
/// It signs in like a device, opens the page's document over the collaboration socket,
/// and edits the second block's text (append) or prints the page's text (read).
import { ApiClient } from "@nookly/shared/api";
import { PAGE_FRAGMENT } from "@nookly/shared/blocks";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import * as Y from "yjs";

const [server, username, password, entityId, action, text = ""] = process.argv.slice(2);
if (!server || !username || !password || !entityId || !action) {
  console.error(
    "usage: page-client.ts <server> <username> <password> <entity id> append|read [text]",
  );
  process.exit(2);
}

let stored: string | null = null;
const api = new ApiClient({
  baseUrl: server,
  tokens: {
    load: async () => stored,
    save: async (token) => {
      stored = token;
    },
  },
});
const user = await api.signIn(username, password, { name: "Script", platform: "script" });
const socket = new HocuspocusProviderWebsocket({
  url: `${server.replace(/^http/, "ws").replace(/\/+$/, "")}/v1/collab`,
});
const doc = new Y.Doc();
const synced = new Promise<void>((resolve) => {
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: `${user.id}:${entityId}`,
    document: doc,
    token: async () => (await api.sessionToken()) ?? "",
    onSynced: () => resolve(),
  });
  provider.attach();
});
await synced;
const fragment = doc.getXmlFragment(PAGE_FRAGMENT);
const block = fragment.get(1);
const textOf = () =>
  fragment
    .toArray()
    .map((n) => n.toString().replace(/<[^>]+>/g, ""))
    .join("\n");
if (action === "append" && block instanceof Y.XmlElement) {
  const last = block.get(block.length - 1);
  if (last instanceof Y.XmlText) last.insert(last.length, text);
  await Bun.sleep(1500);
}
console.log(textOf());
process.exit(0);
