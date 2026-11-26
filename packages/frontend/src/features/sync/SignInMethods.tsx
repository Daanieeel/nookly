import {
  NOOKLY_SIGN_IN,
  SIGN_IN_METHODS_NOTE,
  type SignInActionId,
  type SignInMethod,
  errorToShow,
  providerName,
  signInActions,
  signInDetail,
  signInProviders,
} from "@nookly/shared/api";
import { IconDots } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { BrowserWait } from "./BrowserWait.tsx";
import { ProviderMark } from "./provider-marks.tsx";
import { EmailDialog, PasswordDialog } from "./SignInDialogs.tsx";
import { signedInAccount, syncRuntime, useSyncState } from "./sync-instance.ts";
import { useAccountChange } from "./useAccountChange.ts";

type EmailRequest = { provider: string; add: boolean };

function MethodMenu({
  method,
  run,
}: {
  method: SignInMethod;
  run: Record<SignInActionId, () => void>;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="iconSm" variant="ghost" aria-label="Sign In Options">
              <IconDots />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Sign In Options</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {signInActions(method).map(({ id, label }) => (
          <DropdownMenuItem key={id} onSelect={run[id]}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DisconnectDialog({
  provider,
  current,
  onClose,
}: {
  provider: string | null;
  current: boolean;
  onClose: () => void;
}) {
  const drop = useAccountChange((name: string) => syncRuntime.disconnectProvider(name), onClose);
  return (
    <AlertDialog
      severity="warning"
      open={provider !== null}
      onOpenChange={(open) => {
        if (open) return;
        drop.reset();
        onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {providerName(provider ?? "")}?</AlertDialogTitle>
          <AlertDialogDescription>
            Other devices that signed in with it are signed out and their data is removed from them.
            Changes they haven't synced yet are lost, so sync them first.
            {current ? " This computer signs out too, but your data stays on it." : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldError message={errorToShow(drop.error)} />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep It</AlertDialogCancel>
          <AlertDialogAction
            disabled={drop.isPending}
            onClick={(event) => {
              // Stays open until it is done, or says why it failed.
              event.preventDefault();
              if (provider) drop.mutate(provider);
            }}
          >
            <StatusButtonContent
              status={statusOf(drop)}
              label="Disconnect"
              successLabel="Disconnected"
              errorLabel="Couldn't disconnect"
            />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MethodList() {
  const [email, setEmail] = useState<EmailRequest | null>(null);
  const [password, setPassword] = useState(false);
  const [dropping, setDropping] = useState<string | null>(null);
  const { data: summary, error } = useQuery({
    queryKey: qk.sync.signIn,
    queryFn: () => signedInAccount().signInMethods(),
  });
  const primary = useAccountChange((provider: string) => signedInAccount().setPrimary(provider));
  const connect = useAccountChange((provider: string) => syncRuntime.linkProvider(provider));
  if (!summary) return <FieldError message={errorToShow(error)} />;
  return (
    <div className="flex w-full flex-col gap-2">
      <ul
        aria-label="Sign in methods"
        className="flex flex-col divide-y divide-border/60 rounded-lg border border-border bg-card"
      >
        {signInProviders(summary).map((provider) => {
          const method = summary.methods.find((m) => m.provider === provider);
          return (
            <li key={provider} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <ProviderMark provider={provider} className="size-[18px]" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span>{providerName(provider)}</span>
                  {method?.primary ? <Badge variant="secondary">Primary</Badge> : null}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {signInDetail(method)}
                </span>
              </div>
              {method ? (
                <MethodMenu
                  method={method}
                  run={{
                    primary: () => primary.mutate(provider),
                    email: () => setEmail({ provider, add: false }),
                    password: () => setPassword(true),
                    disconnect: () => setDropping(provider),
                  }}
                />
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={connect.isPending}
                  onClick={() =>
                    provider === NOOKLY_SIGN_IN
                      ? setEmail({ provider, add: true })
                      : connect.mutate(provider)
                  }
                >
                  {provider === NOOKLY_SIGN_IN ? "Add" : "Connect"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{SIGN_IN_METHODS_NOTE}</p>
      <BrowserWait provider={connect.isPending ? (connect.variables ?? null) : null} />
      <FieldError message={errorToShow(primary.error) ?? errorToShow(connect.error)} />
      <EmailDialog request={email} onClose={() => setEmail(null)} />
      <PasswordDialog open={password} onClose={() => setPassword(false)} />
      <DisconnectDialog
        provider={dropping}
        current={dropping !== null && summary.current === dropping}
        onClose={() => setDropping(null)}
      />
    </div>
  );
}

/// How the signed in account signs in, and every change to that.
export function SignInMethods() {
  const signedIn = useSyncState((state) => state.user !== null);
  if (!signedIn) {
    return (
      <p className="text-sm text-muted-foreground">Sign in to Nookly to see how you sign in.</p>
    );
  }
  return <MethodList />;
}
