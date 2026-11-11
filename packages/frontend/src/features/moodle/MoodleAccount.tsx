import { IconLogout } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FieldError, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { type MoodleStatus, moodleDisconnect } from "#/lib/api/moodle.ts";
import { qk } from "#/lib/query-keys.ts";
import { messageOf } from "./moodle-login.ts";

/// The way to sign out, as the last button of the page's toolbar, and why it failed when it
/// does. Signing out forgets the site and what was cached from it. Files already downloaded
/// stay on disk.
export function useMoodleSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
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
}

export function SignOutButton({
  status,
  signOut,
}: {
  status: MoodleStatus;
  signOut: ReturnType<typeof useMoodleSignOut>;
}) {
  const who = [status.fullName, status.siteName].filter(Boolean).join(" on ");
  const label = who ? `Sign out ${who}` : "Sign out";
  return (
    <>
      <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label={label}
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            <StatusIcon status={statusOf(signOut)} idle={<IconLogout size={14} />} size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </>
  );
}

export function SignOutError({ signOut }: { signOut: ReturnType<typeof useMoodleSignOut> }) {
  return <FieldError message={signOut.isError && messageOf(signOut.error)} />;
}
