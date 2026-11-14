import type { EntityRecord, LocalDb } from "@nookly/shared/data";
import { relate } from "@nookly/shared/data";
import { IconCalendarEvent, IconLink, IconSchool, IconTag } from "@tabler/icons-react-native";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useCourses, useLabels, useRecents, useSearch, useSpaces } from "../data/queries.ts";
import { ComposeBody, saveComposeBody, useComposeDoc } from "../editor/ComposeBody.tsx";
import { EditorToolbar } from "../editor/EditorToolbar.tsx";
import { shownValue } from "../ui/DateField.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { DayPicker } from "../ui/sheet/DayPicker.tsx";
import {
  ComposeFooter,
  ComposeHeader,
  ComposeTitle,
  PillSelect,
  PillSheet,
} from "../ui/sheet/Compose.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { localDay } from "./dates.ts";
import { courseOption, entityOption, labelOption, spaceOption } from "./option-badges.tsx";

const PILL_ICON = 18;

/// What a compose form makes, once its title is in: the new item's id. Its description and
/// link are written after it by the form.
export type Create = (db: LocalDb, spaceId: string, title: string) => Promise<string>;

/// A create form as Linear's (D65): close, the Space and send at the top, a big title, the
/// description in the page editor, and the properties as pills on the keyboard. Sending
/// makes the item, writes its description and link, and closes the sheet.
export function ComposeForm({
  spaceId,
  onSpaceChange,
  sendLabel,
  titleLabel,
  titlePlaceholder,
  descriptionPlaceholder = "Description…",
  ready = true,
  create,
  link,
  after,
  pills,
}: {
  spaceId: string | null;
  /// Left out when the Space is fixed (made from inside a Space's page).
  onSpaceChange?: (id: string) => void;
  sendLabel: string;
  titleLabel: string;
  titlePlaceholder: string;
  descriptionPlaceholder?: string;
  /// Whether everything else it needs is set (a course for an assignment).
  ready?: boolean;
  create: Create;
  link?: EntityRecord | null;
  /// Runs with the new item's id once it is made (open it, say so).
  after?: (id: string) => void;
  pills: ReactNode;
}) {
  const close = useCloseSheet();
  const { data: spaces = [] } = useSpaces();
  const [title, setTitle] = useState("");
  const body = useComposeDoc();
  const write = useLocalWrite(async (db, name: string) => {
    if (!spaceId) throw new Error("Make a Space first.");
    const id = await create(db, spaceId, name);
    await saveComposeBody(db, id, body.doc);
    if (link) await relate(db, id, link.id);
    return id;
  });
  const canSend = title.trim() !== "" && spaceId !== null && ready && !write.isPending;
  const send = () => {
    if (!canSend) return;
    write.mutate(title.trim(), {
      onSuccess: (id) => {
        setTitle("");
        body.reset();
        close(after ? () => after(id) : undefined);
      },
    });
  };
  const space = spaces.find((s) => s.id === spaceId);
  return (
    <View className="gap-1">
      <ComposeHeader
        sendLabel={sendLabel}
        canSend={canSend}
        onSend={send}
        context={
          onSpaceChange ? (
            <PillSelect
              label="Space"
              value={spaceId}
              options={spaces.map(spaceOption)}
              onChange={onSpaceChange}
            />
          ) : space ? (
            <Text tone="muted">{space.name}</Text>
          ) : null
        }
      />
      <ComposeTitle
        label={titleLabel}
        value={title}
        onChangeText={setTitle}
        placeholder={titlePlaceholder}
      />
      <ComposeBody doc={body.doc} placeholder={descriptionPlaceholder} />
      {write.error ? (
        <Text tone="destructive" variant="small">
          {write.error.message}
        </Text>
      ) : null}
      <ComposeFooter toolbar={<EditorToolbar inline />}>{pills}</ComposeFooter>
    </View>
  );
}

/// A day as a pill: the calendar in a card.
export function DayPill({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (day: string | null) => void;
}) {
  const theme = useTheme();
  return (
    <PillSheet
      label={label}
      icon={<IconCalendarEvent size={PILL_ICON} color={theme.colors.mutedForeground} />}
      value={value ? shownValue("date", value) : null}
    >
      <DayPicker
        label={label}
        value={value}
        onChange={onChange}
        quick={[{ label: "Today", value: localDay() }]}
      />
    </PillSheet>
  );
}

/// The labels of a Space as a pill: a dot for each picked one and their names, two at most
/// then how many more; tapped, the labels to tick in a card.
export function LabelsPill({
  spaceId,
  value,
  onChange,
}: {
  spaceId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const theme = useTheme();
  const { data: labels = [] } = useLabels(spaceId);
  if (labels.length === 0) return null;
  const picked = labels.filter((l) => value.includes(l.id));
  return (
    <PillSheet
      label="Labels"
      icon={
        picked.length > 0 ? (
          <LabelDots colors={picked.map((l) => l.color)} />
        ) : (
          <IconTag size={PILL_ICON} color={theme.colors.mutedForeground} />
        )
      }
      value={labelSummary(picked.map((l) => l.name))}
    >
      <OptionList
        label="Labels"
        multiple
        values={value}
        options={labels.map(labelOption)}
        onToggle={(id, on) => onChange(on ? [...value, id] : value.filter((x) => x !== id))}
      />
    </PillSheet>
  );
}

/// The names of picked labels in little room: two, then how many more (no commas, which
/// read badly between labels).
export function labelSummary(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length <= 2) return names.join("  ");
  return `${names[0]}  ${names[1]}  +${names.length - 2}`;
}

/// Overlapping colour dots, one per label, three at most.
export function LabelDots({ colors }: { colors: string[] }) {
  const theme = useTheme();
  return (
    <View className="flex-row">
      {colors.slice(0, 3).map((color, i) => (
        <View
          // oxlint-disable-next-line react/no-array-index-key -- dots are positional
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            marginLeft: i === 0 ? 0 : -3,
            backgroundColor: color,
            borderWidth: 1.5,
            borderColor: theme.colors.background,
          }}
        />
      ))}
    </View>
  );
}

/// An item to link the new one to, as a pill: the search in a card.
export function LinkPill({
  value,
  onChange,
}: {
  value: EntityRecord | null;
  onChange: (e: EntityRecord | null) => void;
}) {
  const theme = useTheme();
  return (
    <PillSheet
      label="Link to"
      icon={
        value ? (
          <EntityIcon type={value.type} icon={value.icon} />
        ) : (
          <IconLink size={PILL_ICON} color={theme.colors.mutedForeground} />
        )
      }
      value={value ? value.title || "Untitled" : null}
    >
      <EntitySearch onPick={onChange} />
    </PillSheet>
  );
}

/// The course an assignment or exam belongs to, as a pill.
export function CoursePill({
  spaceId,
  value,
  onChange,
}: {
  spaceId: string;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const theme = useTheme();
  const { data: courses = [] } = useCourses(spaceId);
  return (
    <PillSelect
      label="Course"
      icon={<IconSchool size={PILL_ICON} color={theme.colors.mutedForeground} />}
      value={value}
      options={courses.map((c) => courseOption(c))}
      onChange={onChange}
    />
  );
}

/// Finds an item by its title, key or text, Recents first: the desktop's entity picker.
export function EntitySearch({ onPick }: { onPick: (e: EntityRecord) => void }) {
  const [query, setQuery] = useState("");
  const { data: results = [] } = useSearch(query);
  const { data: recent = [] } = useRecents();
  const shown = query.trim() ? results.slice(0, 30) : recent;
  return (
    <OptionList
      label="Items"
      searchPlaceholder="Titles, keys like TSK-14, page text"
      onQueryChange={setQuery}
      options={shown.map((e) => ({
        ...entityOption(e),
        section: query.trim() ? undefined : "Recent",
      }))}
      value={null}
      onChange={(id) => {
        const e = shown.find((x) => x.id === id);
        if (e) onPick(e);
      }}
    />
  );
}
