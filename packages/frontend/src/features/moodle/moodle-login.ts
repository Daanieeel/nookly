import { listen } from "@tauri-apps/api/event";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { notify } from "#/components/notify.tsx";
import { moodleFinishLogin } from "#/lib/api/moodle.ts";
import { qk } from "#/lib/query-keys.ts";

/// What a failed command rejects with: Tauri hands over the backend's error as a plain
/// object with a `message`, not as an `Error`.
const backendError = z.object({ message: z.string() });

/// The reason a command failed, in words for the person using the app.
export function messageOf(error: { message: string }): string {
  return error.message;
}

/// Where the sign in stands once Moodle has answered. It is kept on the Connect page, because a
/// toast would be gone by the time the sign in window has closed and the person looks back.
export type SignInState = { kind: "finishing" } | { kind: "failed"; message: string } | null;

export function useSignInState(): SignInState {
  const { data } = useQuery<SignInState>({
    queryKey: qk.moodle.signIn,
    queryFn: () => null,
    enabled: false,
    initialData: null,
  });
  return data;
}

const setSignInState = (queryClient: QueryClient, state: SignInState) =>
  queryClient.setQueryData(qk.moodle.signIn, state);

export async function completeMoodleLogin(queryClient: QueryClient, callback: string) {
  const setState = (state: SignInState) => setSignInState(queryClient, state);
  setState({ kind: "finishing" });
  try {
    const status = await moodleFinishLogin(callback);
    setState(null);
    await queryClient.invalidateQueries({ queryKey: qk.moodle.root });
    notify.success("Moodle connected", { description: status.siteName ?? undefined });
  } catch (error) {
    const message = messageOf(
      backendError.safeParse(error).data ?? { message: "Something went wrong." },
    );
    setState({ kind: "failed", message });
    notify.caution("Couldn't connect Moodle", { description: message });
  }
}

/// Matches `CALLBACK_EVENT` and `FAILED_EVENT` in `src-tauri/src/commands/moodle.rs`: the sign in
/// sends the `nookly://token=...` link Moodle redirected to, or why it could not finish. Resolves
/// to the way to stop listening.
export async function listenForMoodleLogin(queryClient: QueryClient): Promise<() => void> {
  const stopCallback = await listen<string>("moodle-callback", (event) => {
    void completeMoodleLogin(queryClient, event.payload);
  });
  const stopFailed = await listen<string>("moodle-login-failed", (event) => {
    setSignInState(queryClient, { kind: "failed", message: event.payload });
  });
  return () => {
    stopCallback();
    stopFailed();
  };
}
