import { signInPath } from "../moodle/intent.ts";

/// Links that open Nookly from outside: Moodle's sign in comes back as `nookly://token=...`,
/// which is not a page, so it goes to the screen that finishes the sign in.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return signInPath(path) ?? path;
}
