import { RATINGS, type Rating, nextDue, reviewCard, studyQueue } from "@nookly/shared/data";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useCards, useDeck } from "../data/queries.ts";
import { Button } from "../ui/Button.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";

const RATING_LABELS = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
} satisfies Record<Rating, string>;

/// "in 10 min", "in 4 days": when a card comes back after a rating.
function comesBack(dueAt: string, now = Date.now()): string {
  const minutes = Math.max(1, Math.round((Date.parse(dueAt) - now) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} mo` : `${Math.round(days / 365)} y`;
}

/// Studying a deck, as on the desktop: the front, then the back, then how well it was
/// known, which FSRS turns into when it comes back.
export function StudyScreen({ deckId }: { deckId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: deck } = useDeck(deckId);
  const { data: cards } = useCards(deckId);
  const [revealed, setRevealed] = useState(false);
  const [studied, setStudied] = useState(0);
  const rate = useLocalWrite((db, input: { cardId: string; rating: Rating }) =>
    reviewCard(db, input.cardId, input.rating),
  );
  if (!cards) return null;
  const card = studyQueue(cards)[0];
  const next = card ? nextDue(card) : null;
  return (
    <>
      <Stack.Screen options={{ title: deck?.entity.title || "Study" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{ padding: theme.space(4), gap: theme.space(4), flexGrow: 1 }}
      >
        {!card ? (
          <View style={{ flex: 1, justifyContent: "center", gap: theme.space(3) }}>
            <Text variant="title" accessibilityRole="header">
              All done for now
            </Text>
            <Text tone="muted">
              {studied > 0
                ? `You studied ${studied} ${studied === 1 ? "card" : "cards"}. The rest come back when they are due.`
                : "Nothing is due in this deck."}
            </Text>
            <Button label="Close" variant="primary" onPress={() => router.back()} />
          </View>
        ) : (
          <>
            <View
              style={{
                padding: theme.space(5),
                gap: theme.space(4),
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
                minHeight: 220,
              }}
            >
              <Text variant="heading" accessibilityLabel={`Front: ${card.front}`}>
                {card.front}
              </Text>
              {revealed ? (
                <>
                  <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                  <Text accessibilityLabel={`Back: ${card.back}`} accessibilityLiveRegion="polite">
                    {card.back}
                  </Text>
                </>
              ) : null}
            </View>
            {revealed && next ? (
              <View style={{ flexDirection: "row", gap: theme.space(2) }}>
                {RATINGS.map((rating) => (
                  <View key={rating} style={{ flex: 1, gap: theme.space(1), alignItems: "center" }}>
                    <Button
                      label={RATING_LABELS[rating]}
                      variant={rating === "good" ? "primary" : "secondary"}
                      accessibilityHint={`Comes back in ${comesBack(next[rating])}`}
                      style={{ alignSelf: "stretch", paddingHorizontal: theme.space(1) }}
                      disabled={rate.isPending}
                      onPress={() =>
                        rate.mutate(
                          { cardId: card.id, rating },
                          {
                            onSuccess: () => {
                              setRevealed(false);
                              setStudied((n) => n + 1);
                            },
                          },
                        )
                      }
                    />
                    <Text variant="small" tone="muted">
                      {comesBack(next[rating])}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Button label="Show Answer" variant="primary" onPress={() => setRevealed(true)} />
            )}
            {rate.isError ? (
              <Text tone="destructive">Couldn't save that answer, try again.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}
