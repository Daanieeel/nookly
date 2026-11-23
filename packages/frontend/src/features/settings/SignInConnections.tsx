import { providerName } from "@nookly/shared/api";
import { IconBrandAppleFilled, IconLock } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { GitHubMark, GoogleMark, NotionMark } from "#/features/sync/provider-marks.tsx";
import { syncRuntime, useSyncState } from "#/features/sync/sync-instance.ts";
import { qk } from "#/lib/query-keys.ts";

/// The marks of the providers an account can sign in with. Google's keeps its colours; the
/// others follow the text.
const MARKS = new Map<string, (props: { className?: string }) => ReactNode>([
  ["google", GoogleMark],
  ["apple", IconBrandAppleFilled],
  ["github", GitHubMark],
  ["notion", NotionMark],
]);

function SignInCard({
  icon,
  name,
  detail,
}: {
  icon: ReactNode;
  name: string;
  detail: string | null;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{name}</span>
        {detail ? <span className="truncate text-xs text-muted-foreground">{detail}</span> : null}
        <span className="text-xs text-muted-foreground">Signs you in to Nookly</span>
      </div>
    </li>
  );
}

/// How the signed in account signs in: a card for each provider it was made with or later
/// linked, and one for its password. Nothing here changes the account.
export function SignInConnections() {
  const signedIn = useSyncState((state) => state.user !== null);
  const { data: account } = useQuery({
    queryKey: qk.sync.account,
    queryFn: async () => syncRuntime.account()?.me() ?? null,
    enabled: signedIn,
  });
  if (!signedIn) {
    return (
      <p className="text-sm text-muted-foreground">Sign in to Nookly to see how you sign in.</p>
    );
  }
  if (!account) return null;
  const cards = (account.providers ?? []).map((provider) => {
    const Mark = MARKS.get(provider);
    return (
      <SignInCard
        key={provider}
        icon={Mark ? <Mark className="size-[18px]" /> : null}
        name={providerName(provider)}
        detail={account.email}
      />
    );
  });
  if (account.hasPassword) {
    cards.push(
      <SignInCard
        key="password"
        icon={<IconLock size={18} />}
        name="Email and password"
        detail={account.email}
      />,
    );
  }
  return (
    <ul aria-label="Sign in connections" className="flex flex-col gap-3">
      {cards}
    </ul>
  );
}
