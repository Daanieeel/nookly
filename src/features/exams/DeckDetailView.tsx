import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCard, listCards, listDueCards, reviewCard } from "@/lib/api/decks";
import type { Entity } from "@/lib/api/types";

export function DeckDetailView({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const { data: cards = [] } = useQuery({
    queryKey: ["cards", entity.id],
    queryFn: () => listCards(entity.id),
  });
  const { data: dueCards = [] } = useQuery({
    queryKey: ["due-cards", entity.id],
    queryFn: () => listDueCards(entity.id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["cards", entity.id] });
    queryClient.invalidateQueries({ queryKey: ["due-cards", entity.id] });
  };

  const addCard = useMutation({
    mutationFn: () => createCard(entity.id, front, back),
    onSuccess: () => {
      invalidate();
      setFront("");
      setBack("");
    },
  });
  const review = useMutation({
    mutationFn: (vars: { cardId: string; remembered: boolean }) =>
      reviewCard(vars.cardId, vars.remembered),
    onSuccess: () => {
      invalidate();
      setRevealed(false);
      setReviewIndex((i) => i + 1);
    },
  });

  const currentDue = dueCards[reviewIndex % Math.max(dueCards.length, 1)];

  return (
    <EntityDetailLayout entity={entity}>
      <div className="flex max-w-xl flex-col gap-6">
        {dueCards.length > 0 && currentDue && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-accent/30 p-6 text-center">
            <span className="text-xs text-muted-foreground">{dueCards.length} due</span>
            <p className="text-lg">{revealed ? currentDue.back : currentDue.front}</p>
            {!revealed ? (
              <Button variant="outline" onClick={() => setRevealed(true)}>
                Show answer
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => review.mutate({ cardId: currentDue.id, remembered: false })}
                >
                  Forgot
                </Button>
                <Button
                  variant="positive"
                  onClick={() => review.mutate({ cardId: currentDue.id, remembered: true })}
                >
                  Remembered
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Add card</h3>
          <Input placeholder="Front" value={front} onChange={(e) => setFront(e.target.value)} />
          <Input placeholder="Back" value={back} onChange={(e) => setBack(e.target.value)} />
          <Button disabled={!front.trim() || !back.trim()} onClick={() => addCard.mutate()}>
            Add card
          </Button>
        </div>

        <div className="flex flex-col">
          {cards.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span className="truncate">{c.front}</span>
              <span className="text-xs text-muted-foreground">box {c.boxLevel}</span>
            </div>
          ))}
          {cards.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No cards yet.</p>
          )}
        </div>
      </div>
    </EntityDetailLayout>
  );
}
