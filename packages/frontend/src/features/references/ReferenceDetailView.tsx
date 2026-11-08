import { IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityDetailLayout } from "#/components/entity-detail-layout.tsx";
import { PropertyRow } from "#/components/property-row.tsx";
import { Button } from "@nookly/ui/components/button";
import { getReference } from "#/lib/api/references.ts";
import type { Entity, Reference } from "#/lib/api/types.ts";
import { formatDateTime } from "#/lib/datetime.ts";
import { providerLabel } from "#/lib/reference-state.ts";
import { qk } from "#/lib/query-keys.ts";
import { ReferenceStateBadge } from "./ReferenceStateBadge.tsx";
import { useReferenceCheck } from "./use-reference-check.ts";

/// A reference's page: what it points at, where that stands right now, and what Nookly last
/// saw of it. Nookly keeps the identity and the title, never the content, so there is nothing
/// to read here beyond that.
export function ReferenceDetailView({ entity }: { entity: Entity }) {
  const { data: reference } = useQuery({
    queryKey: qk.references.byId(entity.id),
    queryFn: () => getReference(entity.id),
  });
  return (
    <EntityDetailLayout
      entity={entity}
      sidebar={reference && <ReferenceProperties reference={reference} />}
    >
      {reference && <ReferenceBody reference={reference} />}
    </EntityDetailLayout>
  );
}

function ReferenceBody({ reference }: { reference: Reference }) {
  const queryClient = useQueryClient();
  const check = useReferenceCheck(reference.entity.id, reference.status);
  const status = check.data ?? reference.status;
  const recheck = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.references.check(reference.entity.id) }),
      queryClient.invalidateQueries({ queryKey: qk.references.byId(reference.entity.id) }),
    ]);
  return (
    <div className="flex max-w-xl flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        {status ? (
          <ReferenceStateBadge status={status} provider={reference.provider} />
        ) : (
          <span className="text-muted-foreground">Checking...</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => void recheck()}
          disabled={check.isFetching}
        >
          <IconRefresh />
          Check Again
        </Button>
      </div>
      <p className="break-all text-muted-foreground">{reference.remoteId}</p>
      {reference.provider === "link" && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => void openUrl(reference.remoteId)}
          >
            <IconExternalLink />
            Open Link
          </Button>
        </div>
      )}
    </div>
  );
}

function ReferenceProperties({ reference }: { reference: Reference }) {
  return (
    <section aria-label="Properties" className="flex flex-col gap-0.5">
      <PropertyRow label="Points to">
        <span className="block truncate px-2 text-sm">{providerLabel(reference.provider)}</span>
      </PropertyRow>
      {reference.lastKnownTitle && (
        <PropertyRow label="Last title">
          <span className="block truncate px-2 text-sm" title={reference.lastKnownTitle}>
            {reference.lastKnownTitle}
          </span>
        </PropertyRow>
      )}
      {reference.lastSeenAt && (
        <PropertyRow label="Last seen">
          <span className="block truncate px-2 text-sm">
            {formatDateTime(reference.lastSeenAt)}
          </span>
        </PropertyRow>
      )}
    </section>
  );
}
