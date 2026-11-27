import { useEffect, useState } from "react";
import { z } from "zod";
import { FieldError } from "#/components/action-feedback.tsx";
import type { RowSpec } from "#/features/settings/setting-rows.tsx";
import { useSetting } from "#/lib/settings/settings.ts";
import { IconServer } from "@tabler/icons-react";
import { UrlInput } from "#/components/url-input.tsx";
import { normalizeServerUrl } from "@nookly/shared/sync";
import { useSyncState } from "./sync-instance.ts";
import { AccountCard, DeviceCards, SignedInOnly } from "./AccountCards.tsx";
import { SignInMethods } from "./SignInMethods.tsx";
import { DeleteAccount } from "./DeleteAccount.tsx";

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
        <div>
          <DeleteAccount className="-ml-3" />
        </div>
      </SignedInOnly>
    ),
  },
];
