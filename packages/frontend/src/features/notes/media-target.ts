/// What a media block (image, video, audio, file) holds: a mention of a File entity, a link,
/// or the full path of a file on this computer. Mirrors `db/local_path.rs`.

/// Whether `text` is the full path of a file: `/Users/me/a.pdf`, `C:\Users\me\a.pdf`,
/// `C:/Users/me/a.pdf` or `\\server\share\a.pdf`. A relative path, `~/a.pdf` and a link are not.
export function isLocalPath(text: string): boolean {
  const value = text.trim();
  const drive = /^[A-Za-z]:[\\/]/.test(value);
  return (value.startsWith("/") && !value.startsWith("//")) || value.startsWith("\\\\") || drive;
}

export type MediaTarget =
  | { kind: "empty" }
  | { kind: "mention"; label: string; fileId: string }
  | { kind: "url"; url: string }
  | { kind: "path"; path: string; name: string }
  | { kind: "invalid" };

const MENTION = /^\[([^\]]*)\]\(mention:([a-zA-Z0-9-]+)\)$/;

/// The last part of a path, which is what the card calls the file.
function fileNameOf(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path;
}

export function parseMediaTarget(content: string): MediaTarget {
  const value = content.trim();
  if (!value) return { kind: "empty" };
  const mention = MENTION.exec(value);
  if (mention) return { kind: "mention", label: mention[1], fileId: mention[2] };
  if (/^https?:\/\/\S+$/.test(value)) return { kind: "url", url: value };
  if (isLocalPath(value)) return { kind: "path", path: value, name: fileNameOf(value) };
  return { kind: "invalid" };
}

/// Why `value` cannot be saved as the path or link of a block, or `null` when it can. Only
/// the shape is checked: a path to a file that is not there is saved all the same.
export function mediaTargetError(value: string): string | null {
  if (!value.trim()) return "Enter the full path of a file, or a link.";
  const target = parseMediaTarget(value);
  if (target.kind === "url" || target.kind === "path") return null;
  return "That is not a full path or a link. A path starts with / or a drive letter like C:\\, a link with https://.";
}

/// A local path as a `file://` URL, the way the markdown export links a File.
export function fileUrl(path: string): string {
  const slashed = path.replace(/\\/g, "/");
  return `file://${slashed.startsWith("/") ? "" : "/"}${encodeURI(slashed)}`;
}
