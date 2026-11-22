import { IconPin, IconSchool } from "@tabler/icons-react-native";
import {
  type NoteGroupBy,
  type NoteGrouping,
  NO_COURSE_GROUP,
  PINNED_GROUP,
  continueNotes,
  groupNotes,
} from "@nookly/shared/note-groups";
import type { PageSummary } from "@nookly/shared/data";
import { notePreviewText } from "@nookly/frontend/lib/note-preview";
import { useRouter } from "expo-router";
import { useState } from "react";
import { type LayoutChangeEvent, PixelRatio, View } from "react-native";
import { Badge } from "../ui/Badge.tsx";
import { Band } from "../ui/Band.tsx";
import { Grid } from "../ui/Grid.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { Card } from "../ui/kit/Card.tsx";
import { OnPage } from "../ui/kit/on-page.ts";
import { ListGroup, ListItem } from "../ui/ListMotion.tsx";
import { Text } from "../ui/Text.tsx";
import { SPACE } from "../ui/tokens.ts";
import { useTheme } from "../ui/theme.ts";
import { ago } from "./dates.ts";
import { labelsThatFit } from "./label-fit.ts";
import { useEntityMenu } from "./entity-actions.tsx";

/// How the Notes page groups its notes, as the desktop's does (`@nookly/shared/note-groups`).
const BY: NoteGrouping<PageSummary> = {
  pinned: (page) => page.entity.pinned,
  courses: (page) => page.courses,
  labels: (page) => page.labels.map((label) => ({ id: label.id, title: label.name })),
  edited: (page) => page.entity.updatedAt,
};

/// The cards are this wide at least, so a phone has two to a line and an iPad more.
const CARD_MIN = 150;

/// How wide each badge is, by its words and the text size, measured once and kept: a page of
/// cards then measures each distinct label once instead of drawing a hidden row on every card.
const BADGE_WIDTHS = new Map<string, number>();
const MORE = "...";
const widthKey = (words: string) => `${PixelRatio.getFontScale()}:${words}`;

/// The labels of a card, on the one line beside its date: as many as fit, the last place given
/// to a "..." badge when some do not, so the row never wraps. Badges not measured yet are
/// drawn once in a hidden row to learn their width.
function CardLabels({ labels }: { labels: PageSummary["labels"] }) {
  const [room, setRoom] = useState<number | null>(null);
  const [, learned] = useState(0);
  const words = [...labels.map((l) => l.name), MORE];
  const missing = words.filter((w) => !BADGE_WIDTHS.has(widthKey(w)));
  const measure = (word: string) => (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (BADGE_WIDTHS.get(widthKey(word)) === width) return;
    BADGE_WIDTHS.set(widthKey(word), width);
    learned((n) => n + 1);
  };
  const widthOf = (word: string) => BADGE_WIDTHS.get(widthKey(word)) ?? 0;
  const measured = missing.length === 0;
  const shown =
    room === null || !measured
      ? 0
      : labelsThatFit(
          labels.map((l) => widthOf(l.name)),
          widthOf(MORE),
          room,
        );
  if (labels.length === 0) return <View className="flex-1" />;
  return (
    <View
      testID="label-room"
      className="flex-1 flex-row items-center gap-1 overflow-hidden"
      onLayout={(event) => setRoom(event.nativeEvent.layout.width)}
    >
      {missing.length > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: "absolute", flexDirection: "row", opacity: 0, gap: 4 }}
        >
          {[...new Set(missing)].map((word) => (
            <View key={word} testID={`label-measure-${word}`} onLayout={measure(word)}>
              <Badge label={word} size="sm" />
            </View>
          ))}
        </View>
      ) : null}
      {labels.slice(0, shown).map((label) => (
        <Badge key={label.id} label={label.name} size="sm" />
      ))}
      {shown < labels.length && measured && room !== null ? (
        <View testID="label-more">
          <Badge label={MORE} size="sm" />
        </View>
      ) : null}
    </View>
  );
}

/// A note as a card: its title, the start of its text, its labels and when it changed. A
/// long press opens the note's menu, as a row's does.
function NoteCard({ page, showCourse }: { page: PageSummary; showCourse?: boolean }) {
  const entityMenu = useEntityMenu();
  const theme = useTheme();
  const router = useRouter();
  const { entity } = page;
  const title = entity.title.trim() || "Untitled";
  const preview = notePreviewText(page.preview, entity.title.trim());
  const course = page.courses[0];
  return (
    <OnPage.Provider value>
      <Card
        testID="note-card"
        accessibilityLabel={title}
        onPress={() => router.push(`/entity/${entity.id}`)}
        onLongPress={() => entityMenu(entity)}
        // Its size in the style, not a className: a className beside the card's own look in a
        // pressable's style left the card without its background and edge.
        style={{ minHeight: 128, gap: SPACE.sm, padding: SPACE.md }}
      >
        <View className="flex-row items-center gap-2">
          <EntityIcon type={entity.type} icon={entity.icon} size={16} />
          <Text numberOfLines={1} className="flex-1 font-medium">
            {title}
          </Text>
          {entity.pinned ? <IconPin size={12} color={theme.colors.mutedForeground} /> : null}
        </View>
        {showCourse && course ? (
          <Text variant="small" tone="muted" numberOfLines={1}>
            {course.title || "Untitled"}
          </Text>
        ) : null}
        <Text variant="small" tone="muted" numberOfLines={3} className="flex-1">
          {preview || "Nothing written yet"}
        </Text>
        <View className="flex-row items-center gap-1">
          <CardLabels labels={page.labels} />
          <Text variant="small" tone="muted" className="shrink-0">
            {ago(entity.updatedAt)}
          </Text>
        </View>
      </Card>
    </OnPage.Provider>
  );
}

/// The latest edits as cards, to pick a note up where it was left. Only when there are more
/// notes than it would show, since the groups below already list a few.
export function ContinueNotes({ pages, limit = 4 }: { pages: PageSummary[]; limit?: number }) {
  if (pages.length <= limit) return null;
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="px-1 font-medium">
        Continue
      </Text>
      <Grid min={CARD_MIN} max={4}>
        {continueNotes(pages, BY, limit).map((page) => (
          <NoteCard key={page.entity.id} page={page} showCourse />
        ))}
      </Grid>
    </View>
  );
}

/// The notes under Pinned and each course (or label, or age), every group folding away on its
/// header, as cards or as the page's rows (`renderRow`), in the order they came.
export function GroupedNotes({
  pages,
  groupBy,
  layout,
  renderRow,
}: {
  pages: readonly PageSummary[];
  groupBy: NoteGroupBy;
  layout: "cards" | "list";
  renderRow: (page: PageSummary) => React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View className="gap-4">
      {groupNotes([...pages], BY, { keepOrder: true, groupBy }).map((group) => (
        <Band
          key={group.id}
          icon={
            group.id === PINNED_GROUP ? (
              <IconPin size={16} color={theme.colors.mutedForeground} />
            ) : groupBy === "course" && group.id !== NO_COURSE_GROUP ? (
              <IconSchool size={16} color={theme.colors.mutedForeground} />
            ) : (
              <View />
            )
          }
          title={group.name}
          count={group.notes.length}
        >
          {layout === "cards" ? (
            <Grid min={CARD_MIN} max={4}>
              {group.notes.map((page) => (
                <NoteCard key={page.entity.id} page={page} />
              ))}
            </Grid>
          ) : (
            <ListGroup>
              {group.notes.map((page) => (
                <ListItem key={page.entity.id}>{renderRow(page)}</ListItem>
              ))}
            </ListGroup>
          )}
        </Band>
      ))}
    </View>
  );
}
