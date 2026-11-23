import {
  type ChangePassword as ChangePasswordValues,
  changePasswordSchema,
} from "@nookly/shared/api";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { FormField, fieldMessage } from "#/components/form-field.tsx";
import { PasswordStrengthMeter } from "#/components/password-strength-meter.tsx";
import type { RowSpec } from "#/features/settings/setting-rows.tsx";
import { qk } from "#/lib/query-keys.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { IconLock, IconServer, IconTrash } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { UrlInput } from "#/components/url-input.tsx";
import { PasswordInput } from "#/components/password-input.tsx";
import { normalizeServerUrl } from "@nookly/shared/sync";
import { syncRuntime, useSyncState } from "./sync-instance.ts";
import { AccountCard, DeviceCards, SignedInOnly } from "./AccountCards.tsx";

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

/// The button that opens the change password form in a dialog, which closes when it is done.
function ChangePassword() {
  const [open, setOpen] = useState(false);
  const ids = { current: useId(), next: useId(), confirm: useId() };
  const user = useSyncState((s) => s.user);
  const change = useMutation({
    mutationFn: async (value: ChangePasswordValues) => {
      const api = syncRuntime.account();
      if (!api) throw new Error("Sign in first.");
      await api.changePassword(value.current, value.next);
    },
    onSuccess: () => setOpen(false),
  });
  const form = useForm({
    defaultValues: { current: "", next: "", confirm: "" },
    validators: { onSubmit: changePasswordSchema },
    onSubmit: ({ value }) => change.mutate(value),
  });
  // A form left half done never carries over to the next time.
  useEffect(() => {
    if (!open) {
      form.reset();
      change.reset();
    }
  }, [open]);
  return (
    <>
      <div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <IconLock size={14} />
          Change Password
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription className="sr-only">
              Enter your current password and a new one.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="current">
              {(field) => (
                <FormField
                  label="Current password"
                  htmlFor={ids.current}
                  error={fieldMessage(field)}
                >
                  <PasswordInput
                    id={ids.current}
                    placeholder="Current password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FormField>
              )}
            </form.Field>
            <form.Field name="next">
              {(field) => (
                <FormField label="New password" htmlFor={ids.next} error={fieldMessage(field)}>
                  <PasswordInput
                    id={ids.next}
                    placeholder="New password"
                    autoComplete="new-password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FormField>
              )}
            </form.Field>
            <form.Field name="confirm">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <PasswordInput
                    id={ids.confirm}
                    aria-label="Repeat new password"
                    placeholder="Repeat new password"
                    aria-invalid={fieldMessage(field) !== undefined}
                    autoComplete="new-password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <FieldError message={fieldMessage(field)} />
                </div>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.next}>
              {(next) => (
                <PasswordStrengthMeter
                  password={next}
                  userInputs={[user?.username, user?.email].filter((v): v is string => !!v)}
                />
              )}
            </form.Subscribe>
            <FieldError message={errorText(change.error)} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <StatusButtonContent
                  status={statusOf(change)}
                  label="Change Password"
                  successLabel="Changed"
                  errorLabel="Couldn't change it"
                />
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/// Deleting the account removes it and everything on the server. This device keeps its data.
/// A button opens the dialog that asks for the password (when the account has one) and a
/// typed phrase.
function DeleteAccount() {
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputId = useId();
  const queryClient = useQueryClient();
  // An account made with another provider has no password; the typed phrase is its confirmation.
  const { data: security } = useQuery({
    queryKey: qk.sync.security,
    queryFn: async () => syncRuntime.account()?.security() ?? null,
  });
  const hasPassword = security?.available !== false;
  const remove = useMutation({
    mutationFn: async () => {
      const api = syncRuntime.account();
      if (!api) throw new Error("Sign in first.");
      await api.deleteAccount(hasPassword ? password : undefined);
      // The account is gone: what is on this device is the only copy, and stays.
      await syncRuntime.detach();
    },
    onSuccess: () => {
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
        onConfirm={() => remove.mutate()}
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
    id: "sync.password",
    category: "sync",
    section: "Password",
    title: "Change password",
    hideTitle: true,
    description: "",
    synonyms: ["password", "security", "change password"],
    control: null,
    footer: (
      <SignedInOnly what="your password">
        <ChangePassword />
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
