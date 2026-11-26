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
import {
  type Icon as TablerIcon,
  IconLock,
  IconMail,
  IconStar,
  IconUnlink,
} from "@tabler/icons-react-native";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { useAppData } from "../../data/context.tsx";
import { keys } from "../../data/keys.ts";
import { GroupedSection } from "../../ui/kit/GroupedSection.tsx";
import { IconBadge } from "../../ui/kit/IconBadge.tsx";
import { ListRow } from "../../ui/kit/ListRow.tsx";
import { useMenu } from "../../ui/menu.tsx";
import { ProviderMark } from "../../ui/ProviderMark.tsx";
import { useAnchor } from "../../ui/sheet/anchor.ts";
import { useOptionalSheetHost } from "../../ui/sheet/SheetHost.tsx";
import { Text } from "../../ui/Text.tsx";
import { useTheme } from "../../ui/theme.ts";
import { useAccount, useAccountChange } from "../account-change.ts";
import { BrowserWait } from "../BrowserWait.tsx";
import { DisconnectSheet, EmailSheet, PasswordSheet } from "./SignInSheets.tsx";

const ACTION_ICONS = {
  primary: IconStar,
  email: IconMail,
  password: IconLock,
  disconnect: IconUnlink,
} satisfies Record<SignInActionId, TablerIcon>;

/// One way of signing in. A connected one opens what can be done with it; the others are
/// connected by a tap.
function MethodRow({
  provider,
  method,
  busy,
  onConnect,
  run,
}: {
  provider: string;
  method: SignInMethod | undefined;
  busy: boolean;
  onConnect: () => void;
  run: Record<SignInActionId, () => void>;
}) {
  const theme = useTheme();
  const menu = useMenu();
  // On a tablet its menu is a popover on the row.
  const anchor = useAnchor();
  const name = providerName(provider);
  const detail = signInDetail(method);
  const add = provider === NOOKLY_SIGN_IN ? "Add" : "Connect";
  const state = method ? (method.primary ? "Primary" : undefined) : add;
  return (
    <View ref={anchor.ref} collapsable={false}>
      <ListRow
        badge={
          <IconBadge
            tint="gray"
            icon={<ProviderMark provider={provider} size={18} color={theme.colors.foreground} />}
          />
        }
        title={name}
        subtitle={detail}
        detail={state}
        accessory={method ? "chevron" : "none"}
        accessibilityLabel={
          method ? [name, detail, state].filter(Boolean).join(", ") : `${add} ${name}`
        }
        disabled={!method && busy}
        onPress={() => {
          if (!method) return onConnect();
          menu.show(
            name,
            signInActions(method).map(({ id, label }) => ({
              label,
              icon: ACTION_ICONS[id],
              onPress: run[id],
            })),
            { anchor },
          );
        }}
      />
    </View>
  );
}

/// How the signed in account signs in, and every change to that (the desktop's Sign in
/// methods).
export function SignInMethods() {
  const host = useOptionalSheetHost();
  const account = useAccount();
  const { sync } = useAppData();
  const { data: summary, error } = useQuery({
    queryKey: keys.sync.signIn,
    queryFn: () => account().signInMethods(),
  });
  const primary = useAccountChange((provider: string) => account().setPrimary(provider));
  const connect = useAccountChange((provider: string) => sync.linkProvider(provider));
  const failed = errorToShow(error) ?? errorToShow(primary.error) ?? errorToShow(connect.error);
  if (!summary) {
    return (
      <Text variant="small" tone={failed ? "destructive" : "muted"} className="px-1">
        {failed ?? "Loading how you sign in."}
      </Text>
    );
  }
  const email = (provider: string, add: boolean) =>
    host?.present({
      title: add ? `Add ${providerName(provider)}` : "Change Email",
      kind: "form",
      content: <EmailSheet provider={provider} add={add} />,
    });
  return (
    <View className="gap-2">
      <GroupedSection margin={0} footer={SIGN_IN_METHODS_NOTE}>
        {signInProviders(summary).map((provider) => (
          <MethodRow
            key={provider}
            provider={provider}
            method={summary.methods.find((method) => method.provider === provider)}
            busy={connect.isPending}
            onConnect={() =>
              provider === NOOKLY_SIGN_IN ? email(provider, true) : connect.mutate(provider)
            }
            run={{
              primary: () => primary.mutate(provider),
              email: () => email(provider, false),
              password: () =>
                host?.present({
                  title: "Change Password",
                  kind: "form",
                  content: <PasswordSheet />,
                }),
              disconnect: () =>
                host?.present({
                  title: `Disconnect ${providerName(provider)}?`,
                  kind: "confirm",
                  content: (
                    <DisconnectSheet provider={provider} current={summary.current === provider} />
                  ),
                }),
            }}
          />
        ))}
      </GroupedSection>
      <BrowserWait provider={connect.isPending ? (connect.variables ?? null) : null} />
      {failed ? <Text tone="destructive">{failed}</Text> : null}
    </View>
  );
}
