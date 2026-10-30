import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

/// Whether a file named by its full path can be used right now.
export type LocalPathState = "ok" | "missing" | "unavailable" | "unreadable" | "folder";

export interface LocalFile {
  state: LocalPathState;
  /// What is wrong, in plain words, naming the path; empty when the file is fine.
  message: string;
  name: string;
}

/// Checks a file on this computer, which only reads it. When it can be read, the webview is
/// allowed to load exactly that file.
export function checkLocalPath(path: string): Promise<LocalFile> {
  return invoke("check_local_path", { path });
}

export function openLocalPath(path: string): Promise<void> {
  return invoke("open_local_path", { path });
}

export function revealLocalPath(path: string): Promise<void> {
  return invoke("reveal_local_path", { path });
}

const failureSchema = z.object({ message: z.string() });

/// What a failed command rejects with: `{ kind, message }` from the backend, or an `Error`.
export type Failure = z.infer<typeof failureSchema>;

/// The short reason in a failure from the backend, for a toast.
export function reasonOf(failure: Failure): string {
  const parsed = failureSchema.safeParse(failure);
  return (parsed.success ? parsed.data.message.replace(/^[a-z ]+: /, "") : "") || "Try again.";
}
