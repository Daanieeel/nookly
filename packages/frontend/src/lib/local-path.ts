import { homeDir, join } from "@tauri-apps/api/path";

/// A local path as typed, pasted or copied from Finder: absolute, `~/`, or a
/// `file://` URL, with shell escapes and wrapping quotes removed. Null for
/// anything else.
export async function localPath(text: string): Promise<string | null> {
  const raw = text.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (raw.startsWith("file://")) return decodeURIComponent(new URL(raw).pathname);
  const unescaped = raw.replace(/\\(.)/g, "$1");
  if (unescaped.startsWith("~/")) return join(await homeDir(), unescaped.slice(2));
  if (unescaped.startsWith("/")) return unescaped;
  return null;
}
