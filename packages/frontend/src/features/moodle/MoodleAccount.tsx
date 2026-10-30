import { IconLogout } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { type MoodleStatus, moodleDisconnect } from "#/lib/api/moodle.ts";
import { qk } from "#/lib/query-keys.ts";
import { messageOf } from "./moodle-login.ts";

/// Who is signed in, and the way to sign out. Signing out forgets the site and what was
/// cached from it. Files already downloaded stay on disk.
export function MoodleAccount({ status }: { status: MoodleStatus }) {
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: moodleDisconnect,
    onSuccess: async () => {
      // Nothing from the old account may show under the next one.
      queryClient.removeQueries({
        queryKey: qk.moodle.root,
        predicate: (query) => query.queryKey[1] !== "status",
      });
      await queryClient.invalidateQueries({ queryKey: qk.moodle.status });
    },
  });
  const who = [status.fullName, status.siteName].filter(Boolean).join(" on ");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{who ? `Signed in as ${who}` : "Signed in"}</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          <StatusButtonContent
            status={statusOf(signOut)}
            icon={<IconLogout size={14} />}
            label="Sign out"
            errorLabel="Try again"
          />
        </Button>
      </div>
      <FieldError message={signOut.isError && messageOf(signOut.error)} />
    </div>
  );
}
