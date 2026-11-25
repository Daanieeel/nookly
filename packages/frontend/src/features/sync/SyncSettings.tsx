import { providerName } from "@nookly/shared/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { FieldError, statusOf } from "#/components/action-feedback.tsx";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { FormField } from "#/components/form-field.tsx";
import type { RowSpec } from "#/features/settings/setting-rows.tsx";
import { qk } from "#/lib/query-keys.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { IconServer, IconTrash } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { UrlInput } from "#/components/url-input.tsx";
import { PasswordInput } from "#/components/password-input.tsx";
import { normalizeServerUrl } from "@nookly/shared/sync";
import { syncRuntime, useSyncState } from "./sync-instance.ts";
import { AccountCard, DeviceCards, SignedInOnly } from "./AccountCards.tsx";
import { SignInMethods } from "./SignInMethods.tsx";

const errorText = (error: Error | null) => (error ? error.message : null);

/// The sync server's address. Fixed while signed in: changing servers means signing out.
export function SyncServerControl() {
  const [saved, setSaved] = useSetting("sync.serverUrl");
  const signedIn = useSyncState((s) => s.user !== null);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const valid = draft.trim() === "" || z.url().safeParse(normalizeServerUrl(draft)).success;
  const commit = () => {
    const next = draft.trim() === "" ? "" : normalizeServerUrl(draft);
    if (valid && next !== saved) setSaved(next);
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <UrlInput
        icon={IconServer}
        aria-label="Server"
        aria-invalid={!valid}
        placeholder="sync.example.com"
        className="w-72"
        value={draft}
        disabled={signedIn}
        title={signedIn ? "Sign out to change the server" : undefined}
        onValueChange={setDraft}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      <FieldError message={!valid && "Enter an address like sync.example.com"} />
    </div>
  );
}

/// Deleting the account removes it and everything on the server. This device keeps its data.
/// A button opens the dialog that asks for the password (when the account has one) and a
/// typed phrase. An account made with another provider has no password: it signs in with
/// that provider once more instead, which the dialog does when the phrase is confirmed.
function DeleteAccount() {
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputId = useId();
  const queryClient = useQueryClient();
  const { data: account } = useQuery({
    queryKey: qk.sync.account,
    queryFn: async () => syncRuntime.account()?.me() ?? null,
  });
  const hasPassword = account?.hasPassword !== false;
  const provider = hasPassword ? null : (account?.providers?.[0] ?? null);
  const remove = useMutation({
    mutationFn: async () => {
      const api = syncRuntime.account();
      if (!api) throw new Error("Sign in first.");
      if (provider) {
        // The provider vouches for the person before the account goes. Closing its browser
        // is a change of mind, not an error.
        if (!(await syncRuntime.confirmWithProvider(provider))) return false;
      }
      await api.deleteAccount(hasPassword ? password : undefined);
      // The account is gone: what is on this device is the only copy, and stays.
      await syncRuntime.detach();
      return true;
    },
    onSuccess: (deleted) => {
      if (!deleted) return;
      setConfirming(false);
      queryClient.removeQueries({ queryKey: qk.sync.root });
    },
  });
  useEffect(() => {
    if (!confirming) {
      setPassword("");
      remove.reset();
    }
  }, [confirming]);
  return (
    <>
      <div>
        <Button
          size="sm"
          variant="destructiveGhost"
          className="-ml-3"
          onClick={() => setConfirming(true)}
        >
          <IconTrash size={14} />
          Delete Account
        </Button>
      </div>
      <ConfirmPermanentDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete your sync account forever?"
        description="Removed from the server for good. This computer keeps its data."
        phrase="delete my account"
        actionLabel="Delete Account"
        errorLabel="Couldn't delete it"
        status={statusOf(remove)}
        error={errorText(remove.error) ?? false}
        disabled={hasPassword && !password}
        onConfirm={() =>
          remove.mutate(undefined, {
            // The browser was closed without confirming: back to how the dialog was.
            onSuccess: (deleted) => {
              if (!deleted) remove.reset();
            },
          })
        }
      >
        {hasPassword ? (
          <FormField label="Your password" htmlFor={inputId}>
            <PasswordInput
              id={inputId}
              placeholder="Your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
        ) : provider ? (
          <p className="text-sm text-muted-foreground">
            You will sign in with {providerName(provider)} once more to confirm it is you.
          </p>
        ) : null}
      </ConfirmPermanentDialog>
    </>
  );
}

/// The Account page's rows, after the registry's server address (which sits last).
export const SYNC_ROWS: RowSpec[] = [
  {
    id: "sync.account",
    category: "sync",
    section: "Account",
    title: "Sync account",
    hideTitle: true,
    description: "",
    synonyms: [
      "sign in",
      "log in",
      "login",
      "sign out",
      "log out",
      "account",
      "conflicts",
      "review changes",
      "register",
      "sign up",
      "sync now",
      "cloud",
      "email",
    ],
    control: null,
    footer: <AccountCard />,
  },
  {
    id: "sync.signin",
    category: "sync",
    section: "Sign in methods",
    title: "Sign in methods",
    hideTitle: true,
    description: "",
    synonyms: [
      "password",
      "change password",
      "security",
      "email",
      "google",
      "github",
      "notion",
      "apple",
      "provider",
      "connect",
    ],
    control: null,
    footer: (
      <SignedInOnly what="how you sign in">
        <SignInMethods />
      </SignedInOnly>
    ),
  },
  {
    id: "sync.devices",
    category: "sync",
    section: "Devices",
    title: "Signed in devices",
    hideTitle: true,
    description: "",
    synonyms: ["sessions", "devices", "phone", "laptop", "sign out", "revoke"],
    control: null,
    footer: (
      <SignedInOnly what="your devices">
        <DeviceCards />
      </SignedInOnly>
    ),
  },
  {
    id: "sync.delete",
    category: "sync",
    section: "Delete account",
    title: "Delete account",
    hideTitle: true,
    description: "",
    synonyms: ["delete account", "remove account", "close account"],
    control: null,
    footer: (
      <SignedInOnly what="how to delete your account">
        <DeleteAccount />
      </SignedInOnly>
    ),
  },
];
