import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { notify } from "#/components/notify.tsx";
import { moodleFinishLogin } from "#/lib/api/moodle.ts";
import { qk } from "#/lib/query-keys.ts";

/// The link Moodle redirects to after the sign in in the browser: `nookly://token=...`, or the
/// scheme of a build installed next to the real app. Any web page can open such a link, so
/// this only hands it to the app, which accepts it for a sign in that Nookly started itself.
export const isMoodleCallback = (url: string): boolean =>
  /^[a-z][a-z0-9+.-]*:\/\/token=/i.test(url.trim());

/// What a failed command rejects with: Tauri hands over the backend's error as a plain
/// object with a `message`, not as an `Error`.
const backendError = z.object({ message: z.string() });

/// The reason a command failed, in words for the person using the app.
export function messageOf(error: { message: string }): string {
  return error.message;
}

export async function completeMoodleLogin(queryClient: QueryClient, callback: string) {
  try {
    const status = await moodleFinishLogin(callback);
    await queryClient.invalidateQueries({ queryKey: qk.moodle.root });
    notify.success("Moodle connected", { description: status.siteName ?? undefined });
  } catch (error) {
    notify.caution("Couldn't connect Moodle", {
      description: messageOf(
        backendError.safeParse(error).data ?? { message: "Something went wrong." },
      ),
    });
  }
}
