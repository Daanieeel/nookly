import {
  IconAlertTriangle,
  IconCloudCheck,
  IconCloudOff,
  IconDeviceLaptop,
  IconDeviceLaptopOff,
  IconFileOff,
  IconFolder,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { qk } from "#/lib/query-keys.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";
import { Checkbox } from "@nookly/ui/components/checkbox";
import { cn } from "@nookly/ui/lib/utils";
import { syncRuntime } from "./sync-instance.ts";

/// One short line of a dialog, led by an icon.
function Point({
  icon: Icon,
  tone,
  children,
}: {
  icon: TablerIcon;
  tone?: "caution";
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <Icon
        size={16}
        aria-hidden
        className={cn("shrink-0", tone === "caution" ? "text-caution" : "text-muted-foreground")}
      />
      <span>{children}</span>
    </li>
  );
}

/// Signing out clears this device unless a local copy is kept: said before it happens,
/// with what has not reached the account yet, which is backed up first.
export function SignOutDialog({
  open,
  onOpenChange,
  keepByDefault = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Whether "keep a local copy" starts ticked: signing out because the account can't go on
  /// without something the person isn't doing now.
  keepByDefault?: boolean;
}) {
  const queryClient = useQueryClient();
  const [keepLocalCopy, setKeepLocalCopy] = useState(keepByDefault);
  const { data: unsent = 0 } = useQuery({
    queryKey: qk.sync.unsent(),
    queryFn: () => syncRuntime.unsentCount(),
    enabled: open,
    gcTime: 0,
  });
  const { data: missingFiles = 0 } = useQuery({
    queryKey: qk.sync.missingFiles(),
    queryFn: () => syncRuntime.missingFilesCount(),
    enabled: open && keepLocalCopy,
    gcTime: 0,
  });
  const close = (next: boolean) => {
    if (!next) setKeepLocalCopy(keepByDefault);
    onOpenChange(next);
  };
  const signOut = useMutation({
    mutationFn: () => syncRuntime.signOut({ keepLocalCopy }),
    onSuccess: () => {
      close(false);
      // Every view showed the account's data, which is no longer here.
      queryClient.removeQueries({ queryKey: qk.sync.root });
      void queryClient.invalidateQueries();
    },
  });
  const sent = unsent === 1 ? "1 change" : `${unsent.toLocaleString()} changes`;
  const missing = missingFiles === 1 ? "1 file" : `${missingFiles.toLocaleString()} files`;
  return (
    <AlertDialog open={open} onOpenChange={close} severity="warning">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of this computer?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <ul className="flex flex-col gap-2.5 pt-1">
              <Point icon={IconCloudCheck}>Stays in your account and on your other devices</Point>
              {keepLocalCopy ? (
                <>
                  <Point icon={IconDeviceLaptop}>
                    A copy stays on this computer and works alone
                  </Point>
                  <Point icon={IconCloudOff}>Changes here no longer sync</Point>
                </>
              ) : (
                <>
                  <Point icon={IconDeviceLaptopOff}>
                    Removed from this computer, back when you sign in
                  </Point>
                  <Point icon={IconFolder}>
                    Files go too, except ones your account doesn't have yet
                  </Point>
                </>
              )}
              {unsent > 0 && (
                <Point icon={IconAlertTriangle} tone="caution">
                  {keepLocalCopy
                    ? `${sent} not sent yet, kept here`
                    : `${sent} not sent yet, backed up first`}
                </Point>
              )}
              {keepLocalCopy && missingFiles > 0 && (
                <Point icon={IconFileOff} tone="caution">
                  {missing} not on this computer yet, missing from the copy
                </Point>
              )}
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox
            id="sign-out-keep-local-copy"
            checked={keepLocalCopy}
            onCheckedChange={(checked) => setKeepLocalCopy(checked === true)}
          />
          <label htmlFor="sign-out-keep-local-copy" className="text-sm">
            Keep a local copy
          </label>
        </div>
        <FieldError message={signOut.error?.message ?? null} />
        <AlertDialogFooter>
          <AlertDialogCancel>Stay Signed In</AlertDialogCancel>
          <AlertDialogAction
            disabled={signOut.isPending}
            onClick={(event) => {
              // The dialog stays open until the sign out is done, or says why it failed.
              event.preventDefault();
              signOut.mutate();
            }}
          >
            <StatusButtonContent
              status={statusOf(signOut)}
              label="Sign Out"
              successLabel="Signed out"
              errorLabel="Couldn't sign out"
            />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
