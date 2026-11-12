import { passwordSchema } from "@nookly/shared/api";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { FormField, fieldMessage } from "#/components/form-field.tsx";
import type { RowSpec } from "#/features/settings/setting-rows.tsx";
import { qk } from "#/lib/query-keys.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { normalizeServerUrl } from "@nookly/shared/sync";
import { syncRuntime, useSyncState } from "./sync-instance.ts";
import {
  AccountCard,
  ChangesCard,
  DeviceCards,
  SharedCards,
  SignedInOnly,
} from "./AccountCards.tsx";

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
      <Input
        aria-label="Server"
        aria-invalid={!valid}
        placeholder="https://sync.example.com"
        className="w-72"
        value={draft}
        disabled={signedIn}
        title={signedIn ? "Sign out to change the server" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      <FieldError message={!valid && "Enter an address like https://sync.example.com"} />
    </div>
  );
}

const changePasswordSchema = z.object({
  current: z.string().min(1, "Enter your current password"),
  next: passwordSchema,
});

function ChangePassword() {
  const ids = { current: useId(), next: useId() };
  const change = useMutation({
    mutationFn: async (value: z.infer<typeof changePasswordSchema>) => {
      const api = syncRuntime.account();
      if (!api) throw new Error("Sign in first.");
      await api.changePassword(value.current, value.next);
    },
    onSuccess: () => form.reset(),
  });
  const form = useForm({
    defaultValues: { current: "", next: "" },
    validators: { onSubmit: changePasswordSchema },
    onSubmit: ({ value }) => change.mutate(value),
  });
  return (
    <form
      noValidate
      className="flex items-end gap-2"
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
            className="flex-1"
            error={fieldMessage(field)}
          >
            <Input
              id={ids.current}
              type="password"
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
          <FormField
            label="New password"
            htmlFor={ids.next}
            className="flex-1"
            error={fieldMessage(field)}
          >
            <Input
              id={ids.next}
              type="password"
              autoComplete="new-password"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </FormField>
        )}
      </form.Field>
      <Button type="submit" size="sm" variant="secondary">
        <StatusButtonContent
          status={statusOf(change)}
          label="Change Password"
          successLabel="Changed"
          errorLabel="Couldn't change it"
        />
      </Button>
      <FieldError message={errorText(change.error)} />
    </form>
  );
}

/// Deleting the account removes it and everything on the server. This device keeps its data.
function DeleteAccount() {
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputId = useId();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: async () => {
      const api = syncRuntime.account();
      if (!api) throw new Error("Sign in first.");
      await api.deleteAccount(password);
      // The account is gone: what is on this device is the only copy, and stays.
      await syncRuntime.detach();
    },
    onSuccess: () => {
      setConfirming(false);
      queryClient.removeQueries({ queryKey: qk.sync.root });
    },
  });
  return (
    <div className="flex items-end gap-2">
      <FormField label="Your password" htmlFor={inputId} className="flex-1">
        <Input
          id={inputId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <Button
        size="sm"
        variant="secondary"
        disabled={!password}
        onClick={() => setConfirming(true)}
      >
        Delete Account
      </Button>
      <ConfirmPermanentDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete your sync account forever?"
        description="The account, its synced data, its devices and its shares are removed from the server. This can't be undone. Everything on this device stays."
        phrase="delete my account"
        actionLabel="Delete Account"
        errorLabel="Couldn't delete it"
        status={statusOf(remove)}
        error={errorText(remove.error) ?? false}
        onConfirm={() => remove.mutate()}
      />
    </div>
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
    description:
      "One account keeps this computer, your phone and your other devices the same, live.",
    synonyms: [
      "sign in",
      "log in",
      "login",
      "sign out",
      "log out",
      "account",
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
    id: "sync.devices",
    category: "sync",
    section: "Devices",
    title: "Signed in devices",
    hideTitle: true,
    description:
      "Every device signed in to your account. Signing one out stops it syncing at once; what it holds stays on it.",
    synonyms: ["sessions", "devices", "phone", "laptop", "sign out", "revoke"],
    control: null,
    footer: (
      <SignedInOnly what="your devices">
        <DeviceCards />
      </SignedInOnly>
    ),
  },
  {
    id: "sync.conflicts",
    category: "sync",
    section: "Changes to review",
    title: "Changes to review",
    hideTitle: true,
    description:
      "When two devices change the same thing before they sync, the newer change shows and the other is kept, so you can keep either, both, or a mix.",
    synonyms: ["conflicts", "lost changes", "overwritten", "merge", "review"],
    control: null,
    footer: <ChangesCard />,
  },
  {
    id: "sync.shared",
    category: "sync",
    section: "Shared with me",
    title: "Shared with me",
    hideTitle: true,
    description:
      "Pages and tasks people shared with you. Accepted ones sync to this computer in a Space of their own.",
    synonyms: ["invites", "invitations", "shared", "collaborate", "accept"],
    control: null,
    footer: (
      <SignedInOnly what="what is shared with you">
        <SharedCards />
      </SignedInOnly>
    ),
  },
  {
    id: "sync.password",
    category: "sync",
    section: "Password and account",
    title: "Change password",
    description:
      "The password you sign in with on every device. Devices already signed in stay signed in.",
    synonyms: ["password", "security", "change password"],
    control: null,
    footer: (
      <SignedInOnly what="your password">
        <ChangePassword />
      </SignedInOnly>
    ),
  },
  {
    id: "sync.delete",
    category: "sync",
    section: "Password and account",
    title: "Delete account",
    description:
      "Removes the account and everything in it from the server, for good. What is on this computer stays here.",
    synonyms: ["delete account", "remove account", "close account"],
    control: null,
    footer: (
      <SignedInOnly what="how to delete your account">
        <DeleteAccount />
      </SignedInOnly>
    ),
  },
];
