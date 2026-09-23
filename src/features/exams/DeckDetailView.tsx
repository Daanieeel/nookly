import { IconCards } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  StatusButtonContent,
  statusOf,
  useActionStatus,
  type ActionStatus,
} from "@/components/action-feedback";
import { EmptyState } from "@/components/empty-state";
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
  const addCardStatus = useActionStatus(addCard);
  const reviewStatus = statusOf(review);
  const reviewStatusFor = (remembered: boolean): ActionStatus =>
    review.variables?.remembered === remembered ? reviewStatus : "idle";
  const submitReview = (remembered: boolean) => {
    if (!currentDue || review.isPending) return;
    review.mutate({ cardId: currentDue.id, remembered });
  };

  return (
    <EntityDetailLayout entity={entity}>
      <div className="flex max-w-xl flex-col gap-6">
        {dueCards.length > 0 && currentDue && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-accent/30 p-6 text-center">
            <span className="text-xs text-muted-foreground">{dueCards.length} due</span>
            <p className="text-lg">{revealed ? currentDue.back : currentDue.front}</p>
            {!revealed ? (
              <Button
                variant="outline"
                onClick={() => {
                  review.reset();
                  setRevealed(true);
                }}
              >
                Show answer
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => submitReview(false)}>
                  <StatusButtonContent
                    status={reviewStatusFor(false)}
                    label="Forgot"
                    errorLabel="Couldn't save, try again"
                  />
                </Button>
                <Button variant="positive" onClick={() => submitReview(true)}>
                  <StatusButtonContent
                    status={reviewStatusFor(true)}
                    label="Remembered"
                    errorLabel="Couldn't save, try again"
                  />
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Add card</h3>
          <Input placeholder="Front" value={front} onChange={(e) => setFront(e.target.value)} />
          <Input placeholder="Back" value={back} onChange={(e) => setBack(e.target.value)} />
          <Button
            size="sm"
            className="self-start"
            disabled={(!front.trim() || !back.trim()) && addCardStatus !== "success"}
            onClick={() => front.trim() && back.trim() && !addCard.isPending && addCard.mutate()}
          >
            <StatusButtonContent
              status={addCardStatus}
              label="Add card"
              successLabel="Card added"
              errorLabel="Couldn't add card, try again"
            />
          </Button>
        </div>

        <div className="flex flex-col border-t border-border pt-2">
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
            <EmptyState
              icon={IconCards}
              title="No cards yet"
              description="Add a front and back above to create your first card."
            />
          )}
        </div>
      </div>
    </EntityDetailLayout>
  );
}
