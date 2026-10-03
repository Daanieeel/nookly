import { IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CSSProperties, ReactNode } from "react";
import { z } from "zod";
import {
  FieldError,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useActionStatus,
} from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Checkbox } from "@nookly/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { Input } from "@nookly/ui/components/input";
import {
  type CalendarConnection,
  type CalendarProvider,
  type ExternalCalendarStatus,
  type RemoteCalendar,
  cancelGoogleCalendarConnect,
  connectGoogleCalendar,
  connectIcloudCalendar,
  disconnectExternalCalendar,
  externalCalendarStatus,
  setExternalCalendarSelected,
} from "#/lib/api/externalCalendars.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { syncExternalCalendarsNow } from "./external-calendar-sync";
import { PROVIDER_LABELS, ProviderIcon } from "./ExternalEventBlock";
import { safeColor } from "./overlay-layout";
import { qk } from "#/lib/query-keys.ts";

const APPLE_PASSWORDS_URL = "https://account.apple.com/account/manage";

export function useExternalCalendarStatus() {
  return useQuery({ queryKey: qk.externalCalendars.status, queryFn: externalCalendarStatus });
}

/// Where Google Calendar and iCloud are connected, each on its own, and where
/// the calendars to overlay are picked. Both stay read only.
export function CalendarConnectionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: status } = useExternalCalendarStatus();
  const connection = (provider: CalendarProvider) =>
    status?.connections.find((c) => c.provider === provider);
  const refresh = useMutation({ mutationFn: () => syncExternalCalendarsNow(queryClient) });
  const refreshStatus = useActionStatus(refresh);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calendar connections</DialogTitle>
          <DialogDescription>
            Show events from your own calendars next to your sessions. Nookly only reads them and
            never changes anything in your calendars.
          </DialogDescription>
        </DialogHeader>

        <ProviderSection provider="google" connection={connection("google")}>
          <GoogleConnect available={status?.googleAvailable ?? false} />
        </ProviderSection>
        <ProviderSection provider="icloud" connection={connection("icloud")}>
          <IcloudConnect />
        </ProviderSection>

        {status && status.connections.length > 0 && (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => !refresh.isPending && refresh.mutate()}
            >
              <StatusButtonContent
                status={refreshStatus}
                icon={<IconRefresh size={14} />}
                label="Refresh now"
                successLabel="Refreshed"
                errorLabel="Couldn't refresh"
              />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProviderSection({
  provider,
  connection,
  children,
}: {
  provider: CalendarProvider;
  connection: CalendarConnection | undefined;
  /// The connect flow, shown while not connected.
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <ProviderIcon provider={provider} size={16} />
        <span className="text-sm font-medium">{PROVIDER_LABELS[provider]}</span>
        {connection && (
          <span className="truncate text-xs text-muted-foreground">{connection.account}</span>
        )}
        {connection && <DisconnectButton provider={provider} />}
      </div>
      {connection ? <ConnectedCalendars connection={connection} /> : children}
    </section>
  );
}

function DisconnectButton({ provider }: { provider: CalendarProvider }) {
  const queryClient = useQueryClient();
  const disconnect = useMutation({
    mutationFn: () => disconnectExternalCalendar(provider),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.externalCalendars.status }),
        queryClient.invalidateQueries({ queryKey: qk.externalCalendars.events }),
      ]),
  });
  return (
    <Button
      variant="ghost"
      size="sm"
      className="ml-auto"
      onClick={() => !disconnect.isPending && disconnect.mutate()}
    >
      <StatusButtonContent
        status={statusOf(disconnect)}
        label="Disconnect"
        errorLabel="Couldn't disconnect"
      />
    </Button>
  );
}

function ConnectedCalendars({ connection }: { connection: CalendarConnection }) {
  const noneSelected = !connection.calendars.some((c) => c.selected);
  return (
    <div className="flex flex-col gap-2">
      {connection.lastError ? (
        <FieldError message={connection.lastError} />
      ) : (
        <span className="text-xs text-muted-foreground">
          {noneSelected
            ? "Pick the calendars to show on your timetable."
            : connection.lastSyncedAt
              ? `Updated ${formatEditedAt(connection.lastSyncedAt).toLowerCase()}`
              : "Waiting for the first update"}
        </span>
      )}
      <ul className="flex flex-col">
        {connection.calendars.map((calendar) => (
          <CalendarRow key={calendar.id} provider={connection.provider} calendar={calendar} />
        ))}
      </ul>
    </div>
  );
}

function CalendarRow({
  provider,
  calendar,
}: {
  provider: CalendarProvider;
  calendar: RemoteCalendar;
}) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: async (selected: boolean) => {
      const connection = await setExternalCalendarSelected(provider, calendar.id, selected);
      queryClient.setQueryData<ExternalCalendarStatus>(qk.externalCalendars.status, (old) =>
        old
          ? {
              ...old,
              connections: old.connections.map((c) => (c.provider === provider ? connection : c)),
            }
          : old,
      );
      // Newly picked calendars have nothing cached yet.
      if (selected) await syncExternalCalendarsNow(queryClient);
      else await queryClient.invalidateQueries({ queryKey: qk.externalCalendars.events });
    },
  });
  const status = statusOf(toggle);
  const id = `external-calendar-${provider}-${calendar.id}`;
  return (
    <li className="flex h-8 items-center gap-2.5 rounded-md px-1 hover:bg-accent/60">
      <Checkbox
        id={id}
        checked={calendar.selected}
        disabled={toggle.isPending}
        onCheckedChange={(checked) => toggle.mutate(checked === true)}
      />
      <span
        className="size-2.5 shrink-0 rounded-full bg-(--cal-color)"
        // SAFETY: `--cal-color` is a hex color checked by `safeColor`, or a token var.
        style={{ "--cal-color": safeColor(calendar.color) } as CSSProperties}
      />
      <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm">
        {calendar.name}
      </label>
      <StatusIcon status={status === "success" ? "idle" : status} idle={null} size={14} />
    </li>
  );
}

function GoogleConnect({ available }: { available: boolean }) {
  const queryClient = useQueryClient();
  const connect = useMutation({
    mutationFn: connectGoogleCalendar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.externalCalendars.status }),
  });
  const status = statusOf(connect);

  if (!available) {
    return (
      <p className="text-xs text-muted-foreground">
        This build of Nookly has no Google client configured, so Google Calendar can't be connected
        here.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Sign in with Google in your browser. Nookly asks only for permission to read your calendar
        list and events.
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => !connect.isPending && connect.mutate()}
        >
          <StatusButtonContent
            status={status}
            icon={<ProviderIcon provider="google" size={14} />}
            label={connect.isPending ? "Waiting for your browser" : "Connect Google Calendar"}
            errorLabel="Try again"
          />
        </Button>
        {connect.isPending && (
          <Button variant="ghost" size="sm" onClick={() => void cancelGoogleCalendarConnect()}>
            Cancel
          </Button>
        )}
      </div>
      <FieldError message={connect.isError && connect.error.message} />
    </div>
  );
}

const icloudSchema = z.object({
  appleId: z.string().trim().min(1, "Enter your Apple ID"),
  password: z.string().trim().min(1, "Paste the app specific password"),
});

type IcloudValues = z.infer<typeof icloudSchema>;

const emptyValues: IcloudValues = { appleId: "", password: "" };

function IcloudConnect() {
  const queryClient = useQueryClient();
  const form = useForm({
    defaultValues: emptyValues,
    validators: { onChange: icloudSchema },
    onSubmit: ({ value }) => {
      if (!connect.isPending) connect.mutate(value);
    },
  });
  const connect = useMutation({
    mutationFn: ({ appleId, password }: IcloudValues) => connectIcloudCalendar(appleId, password),
    onSuccess: () => {
      form.setFieldValue("password", "");
      return queryClient.invalidateQueries({ queryKey: qk.externalCalendars.status });
    },
  });

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p className="text-xs text-muted-foreground">
        Apple offers no sign in for other apps, so iCloud needs an app specific password. It takes a
        minute:
      </p>
      <ol className="list-decimal pl-5 text-xs text-muted-foreground">
        <li>Sign in to your Apple Account in the browser.</li>
        <li>Open Sign In and Security, then App Specific Passwords.</li>
        <li>Create one named Nookly and paste it below.</li>
      </ol>
      <Button
        type="button"
        variant="linkMuted"
        size="sm"
        className="h-auto self-start px-0 text-xs"
        onClick={() => void openUrl(APPLE_PASSWORDS_URL)}
      >
        <IconExternalLink size={12} />
        Open Apple Account
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <form.Field name="appleId">
          {(field) => (
            <FormField label="Apple ID" htmlFor="icloud-apple-id" error={fieldMessage(field)}>
              <Input
                id="icloud-apple-id"
                type="email"
                placeholder="you@icloud.com"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </FormField>
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <FormField
              label="App specific password"
              htmlFor="icloud-password"
              error={fieldMessage(field)}
            >
              <Input
                id="icloud-password"
                type="password"
                placeholder="xxxx-xxxx-xxxx-xxxx"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </FormField>
          )}
        </form.Field>
      </div>
      <FieldError message={connect.isError && connect.error.message} />
      <form.Subscribe selector={hasVisibleErrors}>
        {(blocked) => (
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={blocked}
          >
            <StatusButtonContent
              status={statusOf(connect)}
              icon={<ProviderIcon provider="icloud" size={14} />}
              label="Connect iCloud"
              errorLabel="Try again"
            />
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
