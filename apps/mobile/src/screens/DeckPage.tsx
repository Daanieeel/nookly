import {
  type IndexCard,
  createCard,
  deleteCard,
  setDeckExam,
  studyQueue,
  updateCard,
} from "@nookly/shared/data";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { IconCalendarEvent, IconCards, IconClock, IconStack2 } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import { usePreference } from "../data/preferences.ts";
import { useCards, useDeck } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Grid } from "../ui/Grid.tsx";
import { DetailsPart, MainPart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { InfoRow } from "../ui/property-rows.tsx";
import { Section } from "../ui/Row.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { dayLabel } from "./dates.ts";
import { CardForm } from "./StudyDetail.tsx";
import { ExamProperty } from "./StudyPickers.tsx";

const draftSchema = z.object({ front: z.string(), back: z.string() });
const STATE_LABELS = new Map([
  ["new", "New"],
  ["learning", "Learning"],
  ["review", "Review"],
  ["relearning", "Relearning"],
]);

/// One of the three figures of the hero: large, in its own color, grey at zero.
function Figure({ label, value, color }: { label: string; value: number; color: string }) {
  const theme = useTheme();
  return (
    <View className="items-center gap-0.5">
      <Text
        className="font-heading text-3xl"
        style={{ color: value > 0 ? color : theme.colors.mutedForeground }}
      >
        {value}
      </Text>
      <Text variant="small" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/// An index card the size of the desk: the front you write, flipped to the back, then it drops
/// onto the pile. What is half written is kept for the deck.
function WriteDesk({ deckId, onDone }: { deckId: string; onDone: () => void }) {
  const theme = useTheme();
  const [draft, setDraft] = usePreference(`deck.draft.${deckId}`, draftSchema, {
    front: "",
    back: "",
  });
  const [side, setSide] = useState<"front" | "back">("front");
  const [written, setWritten] = useState(0);
  const add = useLocalWrite((db, card: { front: string; back: string }) =>
    createCard(db, deckId, card.front, card.back),
  );
  const ready = draft.front.trim() !== "" && draft.back.trim() !== "";
  const text = draft[side];
  return (
    <View className="gap-3">
      <View
        className={cn(CARD_CLASSES, "aspect-[5/3] justify-center gap-2 p-4")}
        accessibilityLabel={`Index card, ${side}`}
      >
        <Text variant="small" tone="muted">
          {side === "front" ? "Front" : "Back"}
        </Text>
        <TextInput
          accessibilityLabel={side === "front" ? "Front of the card" : "Back of the card"}
          value={text}
          multiline
          autoFocus
          onChangeText={(value) => setDraft({ ...draft, [side]: value })}
          placeholder={side === "front" ? "The question" : "The answer"}
          placeholderTextColor={theme.colors.mutedForeground}
          className="flex-1 font-heading text-xl text-foreground"
          textAlignVertical="top"
        />
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          label={side === "front" ? "Flip to Back" : "Flip to Front"}
          variant="secondary"
          onPress={() => setSide(side === "front" ? "back" : "front")}
        />
        <Button
          label="Add Card"
          disabled={!ready}
          status={statusOf(add)}
          errorLabel="Couldn't add"
          onPress={() =>
            add.mutate(
              { front: draft.front.trim(), back: draft.back.trim() },
              {
                onSuccess: () => {
                  setDraft({ front: "", back: "" });
                  setSide("front");
                  setWritten((n) => n + 1);
                },
              },
            )
          }
        />
        <Button label="Done" variant="ghost" onPress={onDone} />
      </View>
      {written > 0 ? (
        <Text variant="small" tone="muted">
          {written === 1 ? "1 card added" : `${written} cards added`}
        </Text>
      ) : null}
    </View>
  );
}

function MiniCard({ card, onPress }: { card: IndexCard; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.front}, ${card.back}`}
      accessibilityHint="Edit the card"
      onPress={onPress}
      className={cn(CARD_CLASSES, "aspect-[5/3] justify-between gap-1 p-3 active:opacity-80")}
    >
      <Text numberOfLines={3} className="font-medium">
        {card.front}
      </Text>
      <Text variant="small" tone="muted">
        {STATE_LABELS.get(card.state) ?? card.state}
      </Text>
    </Pressable>
  );
}

/// A deck: a writing desk and a study session in one page. The overview shows how many cards
/// are new, learning and due with buttons to write cards and to study, and the cards as small
/// index cards; writing is one large card; studying is its own full screen.
export function DeckDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: deck } = useDeck(id);
  const { data: cards = [] } = useCards(id);
  const [mode, setMode] = useState<"overview" | "write">("overview");
  const [editing, setEditing] = useState<string | null>(null);
  const exam = useLocalWrite((db, examId: string | null) => setDeckExam(db, id, examId));
  const save = useLocalWrite((db, next: { id: string; front: string; back: string }) =>
    updateCard(db, next.id, next.front, next.back),
  );
  const remove = useLocalWrite((db, cardId: string) => deleteCard(db, cardId));
  if (!deck) return null;
  const queue = studyQueue(cards);
  const next = cards
    .map((c) => c.dueAt)
    .filter((d) => d > new Date().toISOString())
    .sort()[0];
  const edited = cards.find((c) => c.id === editing);
  const muted = theme.colors.mutedForeground;
  return (
    <>
      <DetailsPart>
        <PropertyList>
          <ExamProperty
            icon={<IconCalendarEvent size={20} color={muted} />}
            spaceId={deck.entity.spaceId}
            value={deck.examId}
            readOnly={readOnly}
            onChange={(examId) => exam.mutate(examId)}
          />
          <InfoRow
            icon={<IconCards size={20} color={muted} />}
            label="Cards"
            value={String(deck.stats.total)}
          />
          <InfoRow
            icon={<IconClock size={20} color={muted} />}
            label="Next due"
            value={next ? dayLabel(next.slice(0, 10)) : "Nothing waiting"}
          />
          <InfoRow
            icon={<IconStack2 size={20} color={muted} />}
            label="Created"
            value={dayLabel(deck.entity.createdAt.slice(0, 10))}
          />
        </PropertyList>
      </DetailsPart>
      <MainPart>
        {mode === "write" && !readOnly ? (
          <WriteDesk deckId={id} onDone={() => setMode("overview")} />
        ) : (
          <>
            <View className={cn(CARD_CLASSES, "gap-4 p-4")}>
              <View className="flex-row items-center justify-around">
                <Figure label="New" value={deck.stats.new} color={theme.colors.primary} />
                <Figure label="Learning" value={deck.stats.learning} color="#ec4899" />
                <Figure label="Due" value={deck.stats.due} color={theme.colors.positive} />
              </View>
              <Text variant="small" tone="muted" className="text-center">
                {queue.length === 0
                  ? next
                    ? `All caught up. The next card is due ${dayLabel(next.slice(0, 10))}.`
                    : "All caught up."
                  : `${queue.length} ${queue.length === 1 ? "card" : "cards"} waiting`}
              </Text>
              <View className="flex-row flex-wrap justify-center gap-2">
                {readOnly ? null : (
                  <Button
                    label={`Write cards ${cards.length}`}
                    variant="secondary"
                    onPress={() => setMode("write")}
                  />
                )}
                <Button
                  label={queue.length > 0 ? `Study ${queue.length}` : "Nothing due now"}
                  disabled={queue.length === 0}
                  onPress={() => router.push(`/study/${id}`)}
                />
              </View>
            </View>
            {edited ? (
              <Section title="Edit card">
                <CardForm
                  key={edited.id}
                  initial={{ front: edited.front, back: edited.back }}
                  submitLabel="Save Card"
                  status={save}
                  onSubmit={async (value) => {
                    await save.mutateAsync({ id: edited.id, ...value });
                    setEditing(null);
                  }}
                  onDelete={() => {
                    remove.mutate(edited.id);
                    setEditing(null);
                  }}
                />
              </Section>
            ) : null}
            <View className="gap-2">
              <View className="flex-row items-baseline gap-2 px-1">
                <Text accessibilityRole="header" className="font-medium">
                  Cards
                </Text>
                <Text tone="muted">{cards.length}</Text>
              </View>
              {cards.length === 0 ? (
                <View className="items-start gap-2">
                  <Text tone="muted">No cards yet</Text>
                  {readOnly ? null : (
                    <Button
                      label="Write the first card"
                      variant="secondary"
                      onPress={() => setMode("write")}
                    />
                  )}
                </View>
              ) : (
                <Grid min={150} max={4}>
                  {cards.map((card) => (
                    <MiniCard
                      key={card.id}
                      card={card}
                      onPress={() => !readOnly && setEditing(card.id)}
                    />
                  ))}
                </Grid>
              )}
            </View>
          </>
        )}
      </MainPart>
    </>
  );
}
