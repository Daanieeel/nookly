import {
  type CardBlock,
  type IndexCard,
  createCard,
  deleteCard,
  setDeckExam,
  studyQueue,
  textFaceBlocks,
  updateCardFaces,
} from "@nookly/shared/data";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { IconCalendarEvent, IconCards, IconClock, IconStack2 } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";

import { useCallback, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import { usePreference } from "../data/preferences.ts";
import { useCards, useDeck } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Grid } from "../ui/Grid.tsx";
import { AtAGlance, DetailsPart, MainPart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { InfoRow } from "../ui/property-rows.tsx";
import { Section } from "../ui/Row.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { dayLabel } from "./dates.ts";
import { CardFaceEditor } from "../editor/CardFaceEditor.tsx";
import { sameFace } from "../editor/card-face.ts";
import { ExamProperty } from "./StudyPickers.tsx";

/// A half written card kept for its deck: each face's blocks.
const blockSchema = z.object({
  type: z.string(),
  content: z.string(),
  language: z.string().nullable(),
  filename: z.string().nullable(),
  attrs: z.record(z.string(), z.string()),
});
const draftSchema = z.object({ front: z.array(blockSchema), back: z.array(blockSchema) });
/// What older versions kept: each face as text.
const oldDraftSchema = z.object({ front: z.string(), back: z.string() });
const EMPTY_DRAFT = { front: [], back: [] };

type Side = "front" | "back";
const SIDES = {
  front: { title: "Front", label: "Front of the card", placeholder: "The question" },
  back: { title: "Back", label: "Back of the card", placeholder: "The answer" },
} as const;

/// A face's blocks as the editor holds them, for a face written as text too.
function asBlocks(text: string): CardBlock[] {
  return text.trim() === ""
    ? []
    : textFaceBlocks(text).map((b) => ({
        type: b.type,
        content: b.content,
        language: null,
        filename: null,
        attrs: b.attrs ?? {},
      }));
}

/// A card's face as blocks: the ones it was written with, or its text.
function faceOf(card: IndexCard, side: Side): CardBlock[] {
  return (side === "front" ? card.frontBlocks : card.backBlocks) ?? asBlocks(card[side]);
}

/// Whether a face holds anything: words, or a block that is more than words (a picture).
const written = (blocks: CardBlock[]) =>
  blocks.some((b) => b.content.trim() !== "" || b.type !== "paragraph");
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

/// An index card the size of the desk: the front you write with the page editor, flipped to
/// the back, then it drops onto the pile. What is half written is kept for the deck.
function WriteDesk({ deckId, onDone }: { deckId: string; onDone: () => void }) {
  const [old, setOld] = usePreference(`deck.draft.${deckId}`, oldDraftSchema, {
    front: "",
    back: "",
  });
  const [draft, setDraft] = usePreference(`deck.cardDraft.${deckId}`, draftSchema, {
    // A card half written before the editor came along carries on from its text.
    front: asBlocks(old.front),
    back: asBlocks(old.back),
  });
  const [side, setSide] = useState<Side>("front");
  const [round, setRound] = useState(0);
  const [count, setCount] = useState(0);
  const latest = useRef(draft);
  latest.current = draft;
  const add = useLocalWrite((db, card: { front: CardBlock[]; back: CardBlock[] }) =>
    createCard(db, deckId, { blocks: card.front }, { blocks: card.back }),
  );
  const ready = written(draft.front) && written(draft.back);
  const change = useCallback(
    (blocks: CardBlock[]) => {
      const next = { ...latest.current, [side]: blocks };
      latest.current = next;
      setDraft(next);
    },
    [side, setDraft],
  );
  return (
    <View className="gap-3">
      <View
        className={cn(CARD_CLASSES, "min-h-48 gap-2 p-4")}
        accessibilityLabel={`Index card, ${side}`}
      >
        <Text variant="small" tone="muted">
          {SIDES[side].title}
        </Text>
        <CardFaceEditor
          key={`${side}-${round}`}
          deckId={deckId}
          label={SIDES[side].label}
          placeholder={SIDES[side].placeholder}
          blocks={draft[side]}
          onChange={change}
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
            add.mutate(latest.current, {
              onSuccess: () => {
                setDraft(EMPTY_DRAFT);
                setOld({ front: "", back: "" });
                latest.current = EMPTY_DRAFT;
                setSide("front");
                setRound((n) => n + 1);
                setCount((n) => n + 1);
              },
            })
          }
        />
        <Button label="Done" variant="ghost" onPress={onDone} />
      </View>
      {count > 0 ? (
        <Text variant="small" tone="muted">
          {count === 1 ? "1 card added" : `${count} cards added`}
        </Text>
      ) : null}
    </View>
  );
}

/// A card opened from its small card: both faces in the page editor. Saving writes only the
/// faces that changed, so what the desktop wrote on the other stays as it is.
function CardEditor({
  card,
  onSave,
  onDelete,
  status,
}: {
  card: IndexCard;
  onSave: (faces: { front?: CardBlock[]; back?: CardBlock[] }) => Promise<void>;
  onDelete: () => void;
  status: Parameters<typeof statusOf>[0];
}) {
  const [start] = useState(() => ({ front: faceOf(card, "front"), back: faceOf(card, "back") }));
  const faces = useRef(start);
  const setFront = useCallback((blocks: CardBlock[]) => {
    faces.current = { ...faces.current, front: blocks };
  }, []);
  const setBack = useCallback((blocks: CardBlock[]) => {
    faces.current = { ...faces.current, back: blocks };
  }, []);
  return (
    <View className="gap-3">
      {(["front", "back"] as const).map((side) => (
        <View key={side} className={cn(CARD_CLASSES, "min-h-32 gap-2 p-4")}>
          <Text variant="small" tone="muted">
            {SIDES[side].title}
          </Text>
          <CardFaceEditor
            deckId={card.deckId}
            label={SIDES[side].label}
            placeholder={SIDES[side].placeholder}
            blocks={start[side]}
            onChange={side === "front" ? setFront : setBack}
          />
        </View>
      ))}
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          label="Save Card"
          status={statusOf(status)}
          errorLabel="Couldn't save"
          onPress={() => {
            const { front, back } = faces.current;
            void onSave({
              front: sameFace(front, start.front) ? undefined : front,
              back: sameFace(back, start.back) ? undefined : back,
            });
          }}
        />
        <Button label="Delete Card" variant="destructive" onPress={onDelete} />
      </View>
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
  const save = useLocalWrite((db, next: { id: string; front?: CardBlock[]; back?: CardBlock[] }) =>
    updateCardFaces(db, next.id, {
      front: next.front ? { blocks: next.front } : undefined,
      back: next.back ? { blocks: next.back } : undefined,
    }),
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
  const properties = (
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
  );
  return (
    <>
      <AtAGlance>{properties}</AtAGlance>
      <DetailsPart>{properties}</DetailsPart>
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
                <CardEditor
                  key={edited.id}
                  card={edited}
                  status={save}
                  onSave={async (faces) => {
                    await save.mutateAsync({ id: edited.id, ...faces });
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
