import { IconAlertTriangle, IconCalendarUser } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { cn } from "@nookly/ui/lib/utils";
import {
  CalendarConnectionsDialog,
  useExternalCalendarStatus,
} from "#/features/sessions/external-calendars/CalendarConnectionsDialog.tsx";
import {
  PROVIDER_LABELS,
  ProviderIcon,
} from "#/features/sessions/external-calendars/ExternalEventBlock.tsx";
import type { CalendarConnection, CalendarProvider } from "#/lib/api/externalCalendars.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";

const PROVIDERS: CalendarProvider[] = ["google", "icloud"];

interface ConnectionState {
  text: string;
  tone: "ok" | "idle" | "error";
}

/// One line on how a connection is doing.
function stateOf(connection: CalendarConnection | undefined): ConnectionState {
  if (!connection) return { text: "Not connected", tone: "idle" };
  if (connection.lastError) return { text: "Needs attention", tone: "error" };
  const picked = connection.calendars.filter((c) => c.selected).length;
  const shown = picked === 1 ? "1 calendar shown" : `${picked} calendars shown`;
  return {
    text: connection.lastSyncedAt
      ? `${shown}. Updated ${formatEditedAt(connection.lastSyncedAt).toLowerCase()}`
      : shown,
    tone: "ok",
  };
}

function ConnectionCard({
  provider,
  connection,
  onManage,
}: {
  provider: CalendarProvider;
  connection: CalendarConnection | undefined;
  onManage: () => void;
}) {
  const state = stateOf(connection);
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border bg-card p-4",
        state.tone === "error" ? "border-destructive/50" : "border-border",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <ProviderIcon provider={provider} size={18} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">{PROVIDER_LABELS[provider]}</span>
          <span className="truncate text-xs text-muted-foreground">
            {connection ? connection.account : "Read only. Nothing in your calendar is changed."}
          </span>
          <span
            className={cn(
              "flex items-center gap-1 text-xs",
              state.tone === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {state.tone === "error" && <IconAlertTriangle size={12} className="shrink-0" />}
            {state.text}
          </span>
        </div>
      </div>
      <Button variant="secondary" size="sm" className="shrink-0" onClick={onManage}>
        <IconCalendarUser size={14} />
        {connection ? "Manage" : "Connect"}
      </Button>
    </li>
  );
}

/// A card per account Nookly can show events from, each with its state. Connecting, picking
/// calendars and disconnecting happen in the calendar connections dialog.
export function ConnectionCards() {
  const [open, setOpen] = useState(false);
  const { data: status } = useExternalCalendarStatus();
  return (
    <>
      <ul aria-label="External calendar connections" className="flex flex-col gap-3">
        {PROVIDERS.map((provider) => (
          <ConnectionCard
            key={provider}
            provider={provider}
            connection={status?.connections.find((c) => c.provider === provider)}
            onManage={() => setOpen(true)}
          />
        ))}
      </ul>
      <CalendarConnectionsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
