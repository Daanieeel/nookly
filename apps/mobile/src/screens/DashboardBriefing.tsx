import { IconCloudCheck, IconCloudOff } from "@tabler/icons-react-native";
import { useIsFocused, useRouter } from "expo-router";
import { useState } from "react";
// The runs inside the sentence are plain native text, so they take its size and font.
import { Text as Inline, type TextLayoutEventData, View } from "react-native";
import { useSyncState } from "../data/context.tsx";
import { Mascot } from "../ui/Mascot.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { type Briefing, type LinkTarget } from "./briefing-runs.ts";

/// How a piece of the sentence looks: the greeting, the faded words between, a count, time
/// or day, an item's name, or an emoji in the text colour.
type Look = "greeting" | "glue" | "token" | "name" | "plain";

/// One piece of the sentence, with where it leads when it is a link.
interface Piece {
  text: string;
  look: Look;
  target?: LinkTarget;
}

/// The sentence as one list of pieces, in reading order.
function briefingPieces(briefing: Briefing): Piece[] {
  const runs = (list: Briefing["lead"]): Piece[] =>
    list.map((run) =>
      run.kind === "text"
        ? { text: run.text, look: "glue" }
        : { text: run.text, look: run.kind, target: run.target },
    );
  const pieces: Piece[] = [
    { text: `${briefing.greeting}${briefing.mark}`, look: "greeting" },
    { text: " ", look: "plain" },
    ...runs(briefing.lead),
    { text: briefing.bridge, look: "glue" },
    ...briefing.clauses.flatMap((clause, i): Piece[] => [
      ...(i > 0 ? [{ text: briefing.connectors[i - 1] ?? "", look: "glue" as const }] : []),
      { text: `${clause.icon} `, look: "plain" },
      ...runs(clause.runs),
    ]),
    { text: ".", look: "glue" },
  ];
  return pieces.filter((piece) => piece.text.length > 0);
}

/// The pieces between two character offsets of the sentence, cut where needed.
function slicePieces(pieces: Piece[], from: number, to = Infinity): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const piece of pieces) {
    const start = Math.max(from - at, 0);
    const end = Math.min(to - at, piece.text.length);
    if (end > start) out.push({ ...piece, text: piece.text.slice(start, end) });
    at += piece.text.length;
  }
  return out;
}

const LOOKS = {
  greeting: "font-semibold text-foreground",
  /// The words between the counts, faded as on the desktop (`text-foreground/45`).
  glue: "text-foreground/45",
  /// A count, time or day.
  token: "font-semibold text-foreground",
  /// An item's name: bold on the accent surface, the desktop's pill as far as text allows.
  name: "bg-accent font-semibold text-foreground",
  plain: "text-foreground",
} satisfies Record<Look, string>;

/// Draws pieces as runs of one text; links only when `open` is given (the copy that only
/// measures has none).
function Runs({ pieces, open }: { pieces: Piece[]; open?: (target: LinkTarget) => void }) {
  return pieces.map((piece, i) => {
    const target = piece.target;
    return (
      <Inline
        // The pieces are fixed in order for one sentence.
        // oxlint-disable-next-line react/no-array-index-key
        key={i}
        accessibilityRole={target ? "link" : undefined}
        onPress={target && open ? () => open(target) : undefined}
        className={LOOKS[piece.look]}
      >
        {piece.text}
      </Inline>
    );
  });
}

/// The Dashboard's sentence as large text, as the desktop draws it: the greeting and every
/// count, time and name in the text colour and bold, the words between them faded, so the
/// eye lands on what the day holds. Every count, time and name is tappable: it opens the
/// list or the item it speaks of. The mascot sits in the sentence's first lines, the text
/// flowing around it and on under it at full width.
function DashboardBriefing({
  briefing,
  open,
  compact = false,
}: {
  briefing: Briefing;
  open: (target: LinkTarget) => void;
  /// A size smaller, for a phone's Home.
  compact?: boolean;
}) {
  const focused = useIsFocused();
  const size = compact ? FLOAT.compact : FLOAT.regular;
  const type = compact ? "text-xl leading-8" : "text-2xl leading-9";
  const pieces = briefingPieces(briefing);
  const total = pieces.reduce((n, p) => n + p.text.length, 0);
  const [width, setWidth] = useState(0);
  // How much of the sentence fits beside the mascot; all of it until it was measured.
  const [beside, setBeside] = useState(total);
  const measured = (lines: TextLayoutEventData["lines"]) => {
    let height = 0;
    let chars = 0;
    for (const line of lines) {
      if (height >= size) break;
      height += line.height;
      chars += line.text.length;
    }
    setBeside(Math.min(chars, total));
  };
  const narrow = width - size - FLOAT.gap;
  return (
    <View
      testID="briefing"
      accessibilityRole="header"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View className="flex-row items-start" style={{ gap: FLOAT.gap }}>
        <Text className={`flex-1 text-foreground ${type}`}>
          <Runs pieces={slicePieces(pieces, 0, beside)} open={open} />
        </Text>
        <View style={{ paddingTop: FLOAT.lift }}>
          <Mascot size={size} animate={focused} />
        </View>
      </View>
      {beside < total ? (
        <Text className={`text-foreground ${type}`}>
          <Runs pieces={slicePieces(pieces, beside)} open={open} />
        </Text>
      ) : null}
      {narrow > 0 ? (
        // The whole sentence at the width beside the mascot, unseen, to learn where its
        // lines break.
        <Text
          key={`${narrow}-${total}`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          className={`absolute left-0 top-0 text-foreground opacity-0 ${type}`}
          style={{ width: narrow }}
          onTextLayout={(event) => measured(event.nativeEvent.lines)}
        >
          <Runs pieces={pieces} />
        </Text>
      ) : null}
    </View>
  );
}

/// The mascot's size in the sentence (about two lines of it), the room between them, and how
/// far down it sits to line up with the first line's letters.
const FLOAT = { regular: 64, compact: 56, gap: 12, lift: 4 };

/// The day the Dashboard greets and the sentence about it, the mascot in the sentence. A
/// tablet has no bar, so the date and the connection lead the page; a phone has them in its
/// bar (`DashboardHeaderTitle`).
export function DashboardGreeting({
  briefing,
  open,
  compact = false,
  status = false,
}: {
  briefing: Briefing;
  open: (target: LinkTarget) => void;
  compact?: boolean;
  /// Whether the date and the connection show over the sentence.
  status?: boolean;
}) {
  return (
    <View className="gap-3">
      {status ? <DashboardStatus /> : null}
      <DashboardBriefing briefing={briefing} open={open} compact={compact} />
    </View>
  );
}

/// Today as "Tuesday, 17 November".
function todayText(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/// The date and whether this device reaches the server: a quiet green cloud while it does,
/// a red "Offline" while it does not, nothing while sync is off.
function DashboardStatus({ bar = false }: { bar?: boolean }) {
  const theme = useTheme();
  const state = useSyncState((s) => s.status.state);
  const online = state === "idle" || state === "syncing";
  return (
    <View className="flex-row items-center gap-2">
      <Text
        variant={bar ? "label" : "small"}
        tone={bar ? "default" : "muted"}
        className={bar ? "text-base font-semibold" : undefined}
        numberOfLines={1}
      >
        {todayText()}
      </Text>
      {online ? (
        <View accessible accessibilityLabel="Online">
          <IconCloudCheck size={16} color={theme.colors.positive} />
        </View>
      ) : null}
      {state === "offline" ? (
        <View className="flex-row items-center gap-1">
          <IconCloudOff size={16} color={theme.colors.destructive} />
          <Text variant="small" tone="destructive" className="font-medium">
            Offline
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/// The phone's Dashboard bar says the date and the connection instead of "Dashboard".
export function DashboardHeaderTitle() {
  return <DashboardStatus bar />;
}

/// Where a link of the sentence goes.
export function useOpenTarget(firstSpace: string | undefined) {
  const router = useRouter();
  return (target: LinkTarget) => {
    if (target.kind === "entity") router.push(`/entity/${target.id}`);
    else if (target.kind === "overview") {
      router.push(target.view === "tasks" ? "/tasks" : "/assignments");
    } else {
      const space = target.spaceIds[0] ?? firstSpace;
      if (space) router.push(`/module/${space}/${target.list}`);
    }
  };
}
