import {
  type IndexCard,
  RATINGS,
  type Rating,
  nextDue,
  reviewCard,
  studyQueue,
  undoReview,
} from "@nookly/shared/data";
import { IconArrowBackUp, IconConfetti, IconX } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalWrite } from "../data/context.tsx";
import { useCards, useDeck } from "../data/queries.ts";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { CardFaceView } from "../editor/CardFaceView.tsx";
import { Button } from "../ui/Button.tsx";
import { PAGE_BACKGROUND, cn } from "../ui/classes.ts";
import { useScheme, useSemantic } from "../ui/kit/scheme.ts";
import { FADE } from "../ui/motion.ts";
import { Separator } from "../ui/Row.tsx";
import { RoundButton } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { SPACE, TINT } from "../ui/tokens.ts";
import { MIN_TOUCH } from "../ui/touch.ts";

/// The ratings as the desktop draws them: Again red, Hard amber, Good green, Easy plain.
const RATING_LOOKS = {
  again: { label: "Again", variant: "destructive" },
  hard: { label: "Hard", variant: "caution" },
  good: { label: "Good", variant: "positive" },
  easy: { label: "Easy", variant: "secondary" },
} as const satisfies Record<Rating, { label: string; variant: string }>;

type Group = "new" | "learning" | "review";
const GROUPS: { id: Group; label: string; tint: keyof typeof TINT }[] = [
  { id: "new", label: "new", tint: "blue" },
  { id: "learning", label: "learning", tint: "pink" },
  { id: "review", label: "due", tint: "green" },
];
const groupOf = (card: IndexCard): Group =>
  card.state === "new" ? "new" : card.state === "review" ? "review" : "learning";

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

/// Studying a deck, as the desktop's session: Back to Deck at any time, how many cards are
/// left of each kind and how far along, the front, then the back under it, then how well
/// it was known, which FSRS turns into when it comes back. The last rating can be taken
/// back, one at a time.
export function StudyScreen({ deckId }: { deckId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: deck } = useDeck(deckId);
  const { data: cards } = useCards(deckId);
  const [revealed, setRevealed] = useState(false);
  /// The cards rated here, latest last, so each rating can be taken back in turn.
  const [answered, setAnswered] = useState<string[]>([]);
  /// A card just brought back by Undo shows next, wherever the queue sorts it.
  const [pinned, setPinned] = useState<string | null>(null);
  const undo = useLocalWrite((db, cardId: string) => undoReview(db, cardId));
  const rate = useLocalWrite((db, input: { cardId: string; rating: Rating }) =>
    reviewCard(db, input.cardId, input.rating),
  );
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const undoLast = () => {
    const last = answered.at(-1);
    if (!last || undo.isPending) return;
    undo.mutate(last, {
      onSuccess: () => {
        setAnswered((list) => list.slice(0, -1));
        setPinned(last);
        setRevealed(false);
      },
    });
  };
  const queue = cards ? studyQueue(cards) : [];
  const card = queue.find((c) => c.id === pinned) ?? queue[0];
  const next = card ? nextDue(card) : null;
  const counts = { new: 0, learning: 0, review: 0 };
  for (const c of queue) counts[groupOf(c)] += 1;
  const done = answered.length;
  return (
    <>
      <View className={cn("flex-1", PAGE_BACKGROUND)} style={{ paddingTop: insets.top }}>
        <View
          className="flex-row items-center gap-2"
          style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm }}
        >
          <RoundButton label="Back to Deck" onPress={leave}>
            <StudyIcon icon={IconX} />
          </RoundButton>
          <View className="flex-1 items-center">
            <Text variant="label" numberOfLines={1}>
              {deck?.entity.title || "Study"}
            </Text>
            {card ? <Counts counts={counts} current={groupOf(card)} /> : null}
          </View>
          <RoundButton
            label={undo.isError ? "Couldn't undo, try again" : "Undo Last Rating"}
            disabled={done === 0}
            onPress={undoLast}
          >
            <StudyIcon icon={IconArrowBackUp} />
          </RoundButton>
        </View>
        <Progress done={done} left={queue.length} />
        {!cards ? null : (
          <ScrollView
            contentContainerClassName="grow gap-4 p-4"
            contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.lg }}
          >
            {!card ? (
              <Finished studied={done} onClose={leave} />
            ) : (
              <>
                <Animated.View
                  key={`${card.id}:${done}`}
                  entering={FadeIn.duration(FADE.in)}
                  exiting={FadeOut.duration(FADE.out)}
                >
                  <Pressable
                    accessible={false}
                    onPress={() => setRevealed(true)}
                    className={cn(CARD_CLASSES, "min-h-56 gap-4 p-5")}
                  >
                    <CardFaceView card={card} side="front" heading muted={revealed} />
                    {revealed ? (
                      <>
                        <Separator />
                        <View accessibilityLiveRegion="polite">
                          <CardFaceView card={card} side="back" />
                        </View>
                      </>
                    ) : null}
                  </Pressable>
                </Animated.View>
                {revealed && next ? (
                  <View className="flex-row gap-2">
                    {RATINGS.map((rating) => (
                      <View key={rating} className="flex-1 items-center gap-1">
                        <Button
                          label={RATING_LOOKS[rating].label}
                          variant={RATING_LOOKS[rating].variant}
                          accessibilityHint={`Comes back in ${comesBack(next[rating])}`}
                          className="self-stretch px-1"
                          disabled={rate.isPending}
                          onPress={() =>
                            rate.mutate(
                              { cardId: card.id, rating },
                              {
                                onSuccess: () => {
                                  setRevealed(false);
                                  setPinned(null);
                                  setAnswered((list) => [...list, card.id]);
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
                  <Button label="Show Answer" onPress={() => setRevealed(true)} />
                )}
                {rate.isError ? (
                  <Text tone="destructive">Couldn't save that rating, try again.</Text>
                ) : null}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </>
  );
}

function StudyIcon({ icon: Icon }: { icon: typeof IconX }) {
  const theme = useTheme();
  return <Icon size={22} color={theme.colors.foreground} />;
}

/// How many cards are left of each kind, the kind of the card shown underlined.
function Counts({ counts, current }: { counts: Record<Group, number>; current: Group }) {
  const scheme = useScheme();
  const muted = useSemantic("secondaryLabel");
  return (
    <View
      accessible
      accessibilityLabel={GROUPS.map((g) => `${counts[g.id]} ${g.label}`).join(", ")}
      className="flex-row items-center gap-3"
    >
      {GROUPS.map((g) => (
        <View
          key={g.id}
          className="flex-row items-baseline gap-1"
          style={{
            borderBottomWidth: 2,
            borderBottomColor: g.id === current ? TINT[g.tint][scheme] : "transparent",
          }}
        >
          <Text
            variant="small"
            className="font-medium"
            style={{ color: counts[g.id] > 0 ? TINT[g.tint][scheme] : muted }}
          >
            {counts[g.id]}
          </Text>
          <Text variant="small" tone="muted">
            {g.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/// How far along the session is: the cards rated of all the session holds.
function Progress({ done, left }: { done: number; left: number }) {
  const scheme = useScheme();
  const track = useSemantic("fill");
  const total = done + left;
  const share = total === 0 ? 1 : done / total;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: done }}
      style={{ height: 3, marginHorizontal: SPACE.lg, borderRadius: 2, backgroundColor: track }}
    >
      <View
        style={{
          height: 3,
          borderRadius: 2,
          width: `${share * 100}%`,
          backgroundColor: TINT.green[scheme],
        }}
      />
    </View>
  );
}

function Finished({ studied, onClose }: { studied: number; onClose: () => void }) {
  const scheme = useScheme();
  return (
    <View className="flex-1 items-center justify-center gap-3 px-4">
      <View
        className="items-center justify-center rounded-full"
        style={{ width: MIN_TOUCH, height: MIN_TOUCH, backgroundColor: `${TINT.green[scheme]}22` }}
      >
        <IconConfetti size={22} color={TINT.green[scheme]} />
      </View>
      <Text variant="title" accessibilityRole="header">
        All caught up
      </Text>
      <Text tone="muted" className="text-center">
        {studied > 0
          ? `You rated ${studied} ${studied === 1 ? "card" : "cards"}. The rest come back when they are due.`
          : "Nothing is due in this deck."}
      </Text>
      <Button label="Back to Deck" variant="secondary" onPress={onClose} />
    </View>
  );
}
