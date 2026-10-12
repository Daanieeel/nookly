import { IconCards, IconSparkles } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { listDeckSummariesAllSpaces } from "#/lib/api/decks.ts";
import { listExamsAllSpaces } from "#/lib/api/exams.ts";
import type { DeckSummary, Exam } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { studyCount } from "#/features/exams/deck/deck-data.ts";
import { DeckStack } from "#/features/exams/deck/index-card.tsx";
import { DeckCounts, ExamLine, StudyButton } from "#/features/exams/DecksListView.tsx";
import { EmptyRow, Panel, ShowMore } from "./DashboardPanel";
import { listLink, useOpenTarget } from "./dashboard-links";

/// Deck cards shown before "Show more".
const DECK_LIMIT = 4;

function DeckCard({ deck, exam }: { deck: DeckSummary; exam: Exam | undefined }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const { entity } = deck;
  return (
    <div className="group relative min-w-0" {...entityTarget(entity)}>
      <button
        type="button"
        onClick={() => openEntity(entity.id, entity.spaceId)}
        aria-label={`Open ${displayTitle(entity)}`}
        className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 pr-20 text-left transition-colors outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <DeckStack count={deck.stats.total} size="sm" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{displayTitle(entity)}</span>
          {exam && <ExamLine exam={exam} />}
          <DeckCounts stats={deck.stats} />
        </div>
      </button>
      <span className="absolute top-3 right-3">
        <StudyButton deck={deck} />
      </span>
    </div>
  );
}

/// Decks with cards to learn today. A deck leaves once its cards are done and comes
/// back when more are due.
export function DecksPanel() {
  const open = useOpenTarget();
  const { data: decks = [] } = useQuery({
    queryKey: qk.decks.summariesAll,
    queryFn: listDeckSummariesAllSpaces,
  });
  const { data: exams = [] } = useQuery({ queryKey: qk.exams.all, queryFn: listExamsAllSpaces });
  const examOf = new Map(exams.map((e) => [e.entity.id, e]));
  const examDate = (d: DeckSummary) => (d.examId && examOf.get(d.examId)?.examDate) || "9999-12-31";
  const ready = decks
    .filter((d) => studyCount(d.stats) > 0)
    .sort(
      (a, b) => examDate(a).localeCompare(examDate(b)) || studyCount(b.stats) - studyCount(a.stats),
    );

  return (
    <Panel icon={IconCards} title="Decks">
      {ready.length === 0 ? (
        <EmptyRow icon={IconSparkles}>Nothing to study. Every deck is caught up.</EmptyRow>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {ready.slice(0, DECK_LIMIT).map((deck) => (
            <DeckCard
              key={deck.entity.id}
              deck={deck}
              exam={deck.examId ? examOf.get(deck.examId) : undefined}
            />
          ))}
        </div>
      )}
      <ShowMore
        count={ready.length - DECK_LIMIT}
        onClick={() =>
          open(
            listLink(
              "decks",
              ready.map((d) => d.entity.spaceId),
            ),
          )
        }
      />
    </Panel>
  );
}
