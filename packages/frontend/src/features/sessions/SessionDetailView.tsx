import { IconNotebook, IconNote, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MarkdownEditor } from "#/components/markdown-editor.tsx";
import { EntityDetailLayout } from "#/components/entity-detail-layout.tsx";
import { statusOf, StatusButtonContent } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  GalleryCard,
  GalleryCardBanner,
  GalleryCardBody,
} from "@nookly/ui/components/gallery-card";
import { listJotSummaries, listNoteSummaries } from "#/lib/api/notes.ts";
import {
  createSessionPage,
  getSessionPages,
  listSessions,
  overrideOccurrence,
} from "#/lib/api/sessions.ts";
import type { Entity, SessionOccurrence } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { viewAfterTrash } from "#/lib/modules.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { notePreviewText } from "../notes/note-preview";
import {
  DeleteSeriesDialog,
  refreshSessions,
  SessionEditForm,
  SessionPages,
  SessionSummary,
  sessionPageTitle,
} from "./calendar/SessionPopover";
import { SessionCalendarCutout } from "./SessionCalendarCutout";

/// A Session occurrence's own page: its notes, where it sits in the week, and the
/// Jot and Note written for it. The sidebar carries the same controls as the
/// calendar popover, including the edit scope (this session, this and following,
/// all upcoming), with this occurrence selected by default.
export function SessionDetailView({ entity }: { entity: Entity }) {
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions.bySpace(entity.spaceId),
    queryFn: () => listSessions(entity.spaceId),
  });
  const occurrence = sessions.find((s) => s.entity.id === entity.id);

  return (
    <EntityDetailLayout
      entity={entity}
      sidebar={occurrence && <SessionSidebar entity={entity} occurrence={occurrence} />}
    >
      {occurrence && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pb-8">
          <SessionNotes occurrence={occurrence} />
          <SessionCalendarCutout occurrence={occurrence} />
          <SessionPageCards occurrence={occurrence} />
        </div>
      )}
    </EntityDetailLayout>
  );
}

function SessionSidebar({ entity, occurrence }: { entity: Entity; occurrence: SessionOccurrence }) {
  const setView = useNavStore((s) => s.setView);
  const [editing, setEditing] = useState(false);
  const [seriesDeleteOpen, setSeriesDeleteOpen] = useState(false);

  return (
    <section aria-label="Session" className="flex flex-col rounded-lg border">
      {editing ? (
        <SessionEditForm occurrence={occurrence} onDone={() => setEditing(false)} />
      ) : (
        <SessionSummary
          occurrence={occurrence}
          showTitle={false}
          compact
          onEdit={() => setEditing(true)}
          onDeleteSeries={() => setSeriesDeleteOpen(true)}
          close={() => setView(viewAfterTrash(entity))}
        />
      )}
      <SessionPages spaceId={entity.spaceId} occurrence={occurrence} close={() => {}} compact />
      {occurrence.templateId && (
        <DeleteSeriesDialog
          spaceId={entity.spaceId}
          occurrence={occurrence}
          templateId={occurrence.templateId}
          open={seriesDeleteOpen}
          onOpenChange={setSeriesDeleteOpen}
        />
      )}
    </section>
  );
}

/// The Session's `notes` field, as markdown.
function SessionNotes({ occurrence }: { occurrence: SessionOccurrence }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (markdown: string) =>
      overrideOccurrence(occurrence.entity.id, { notes: markdown.trim() ? markdown : null }),
    onSuccess: () => refreshSessions(queryClient, occurrence.entity.id),
  });
  return (
    <MarkdownEditor
      key={occurrence.entity.id}
      value={occurrence.notes ?? ""}
      onSave={(markdown) => save.mutate(markdown)}
      placeholder="Notes for this session…"
      className="min-h-10"
    />
  );
}

/// The Jot and Note of this occurrence as clickable previews; one that doesn't exist
/// yet is a card that creates it.
function SessionPageCards({ occurrence }: { occurrence: SessionOccurrence }) {
  const { data: pages } = useQuery({
    queryKey: qk.sessions.pages(occurrence.entity.id),
    queryFn: () => getSessionPages(occurrence.entity.id),
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SessionPageCard kind="jot" occurrence={occurrence} page={pages?.jot} loading={!pages} />
      <SessionPageCard kind="note" occurrence={occurrence} page={pages?.note} loading={!pages} />
    </div>
  );
}

const PAGE_CARDS = {
  jot: {
    noun: "Jot",
    icon: IconNotebook,
    hint: "Type quick notes while the session runs.",
  },
  note: {
    noun: "Note",
    icon: IconNote,
    hint: "Refine what you took away from the session.",
  },
} as const;

function SessionPageCard({
  kind,
  occurrence,
  page,
  loading,
}: {
  kind: "jot" | "note";
  occurrence: SessionOccurrence;
  page: Entity | null | undefined;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const { noun, icon: Icon, hint } = PAGE_CARDS[kind];
  const spaceId = occurrence.entity.spaceId;

  // Same summaries the Notes and Jots lists read, so the preview shares their cache.
  const { data: summaries = [] } = useQuery({
    queryKey:
      kind === "jot" ? qk.entities.jotSummaries(spaceId) : qk.entities.noteSummaries(spaceId),
    queryFn: () => (kind === "jot" ? listJotSummaries(spaceId) : listNoteSummaries(spaceId)),
    enabled: page != null,
  });
  const summary = summaries.find((s) => s.entity.id === page?.id);

  const create = useMutation({
    mutationFn: () => createSessionPage(occurrence.entity.id, kind, sessionPageTitle(occurrence)),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.sessions.pages(occurrence.entity.id) }),
        queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(spaceId) }),
      ]);
      openEntity(created.id, spaceId);
    },
  });

  if (page) {
    const text = summary ? notePreviewText(summary.preview, page.title) : "";
    return (
      <GalleryCard onClick={() => openEntity(page.id, spaceId)} aria-label={`Open ${noun}`}>
        <GalleryCardBody className="min-h-28">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Icon size={15} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{displayTitle(page)}</span>
          </span>
          <p className="line-clamp-4 text-xs text-muted-foreground">
            {text || `This ${noun.toLowerCase()} is empty.`}
          </p>
        </GalleryCardBody>
      </GalleryCard>
    );
  }
  return (
    <GalleryCard variant="dashed">
      <GalleryCardBanner
        color="var(--muted)"
        icon={<Icon size={20} className="text-muted-foreground/50" />}
      />
      <GalleryCardBody className="items-center text-center">
        <p className="text-sm font-medium text-foreground">No {noun.toLowerCase()} yet</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <Button
          size="sm"
          className="mt-1 gap-1.5"
          disabled={loading}
          onClick={() => !create.isPending && create.mutate()}
        >
          <StatusButtonContent
            status={statusOf(create)}
            icon={<IconPlus size={14} />}
            label={`New ${noun.toLowerCase()}`}
            errorLabel="Try again"
          />
        </Button>
      </GalleryCardBody>
    </GalleryCard>
  );
}
