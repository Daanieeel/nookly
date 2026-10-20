import {
  type EntityRecord,
  attachLabel,
  createLabel,
  detachLabel,
  type LinkedItem,
  RELATIONSHIP_TYPES,
  createRelationship,
  unrelate,
} from "@nookly/shared/data";
import { IconLinkOff, IconPlus, IconTag } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import {
  useEntityLabels,
  useLabels,
  useLinks,
  useMentions,
  useRecents,
  useRelated,
  useSearch,
} from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Field } from "../ui/Field.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { Property, PropertyList } from "../ui/Property.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";

/// How an item is tied to others, as the desktop's right sidebar shows it: its links in both
/// directions, each read as "Blocks" or "blocked by", the files attached to it, and the
/// pages that mention it and the items it mentions.
export function RelatedSection({ entity, readOnly }: { entity: EntityRecord; readOnly: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: links = [] } = useLinks(entity.id);
  const { data: mentioned } = useMentions(entity.id);
  const remove = useLocalWrite((db, relationshipId: string) => unrelate(db, relationshipId));
  const attached = links.filter((l) => l.type.name === "attached-file" && l.outgoing);
  const others = links.filter((l) => !attached.includes(l));
  const open = (id: string) => router.push(`/entity/${id}`);
  const unlink = (item: LinkedItem) =>
    readOnly || !item.type.creatable ? undefined : (
      <IconButton
        label={`Unlink ${item.entity.title || "Untitled"}`}
        icon={<IconLinkOff size={18} color={theme.colors.mutedForeground} />}
        onPress={() => remove.mutate(item.relationshipId)}
      />
    );
  const linkRow = (item: LinkedItem) => (
    <View key={item.relationshipId}>
      <Row
        title={item.entity.title || "Untitled"}
        subtitle={`${item.label} · ${item.entity.key}`}
        icon={<EntityIcon type={item.entity.type} icon={item.entity.icon} />}
        onPress={() => open(item.entity.id)}
        trailing={unlink(item)}
      />
    </View>
  );
  const plainRow = (e: EntityRecord) => (
    <View key={e.id}>
      <Row
        title={e.title || "Untitled"}
        subtitle={e.key}
        icon={<EntityIcon type={e.type} icon={e.icon} />}
        onPress={() => open(e.id)}
      />
    </View>
  );
  return (
    <>
      <Section
        title="Related"
        action={
          readOnly ? undefined : (
            <IconButton
              label="Add Related Item"
              icon={<IconPlus size={18} color={theme.colors.mutedForeground} />}
              onPress={() => router.push(`/new/link?entityId=${entity.id}`)}
            />
          )
        }
      >
        {others.length === 0 ? <Empty text="Nothing linked yet." /> : others.map(linkRow)}
      </Section>
      {attached.length > 0 ? <Section title="Attachments">{attached.map(linkRow)}</Section> : null}
      {mentioned && mentioned.mentions.length > 0 ? (
        <Section title="Mentioned">{mentioned.mentions.map(plainRow)}</Section>
      ) : null}
      {mentioned && mentioned.mentionedIn.length > 0 ? (
        <Section title="Mentioned in">{mentioned.mentionedIn.map(plainRow)}</Section>
      ) : null}
    </>
  );
}

/// The Space's labels as a property row: its value is the labels on the item; opened, the
/// Space's labels as chips (tap to put one on or take it off) and a field to name a new one.
export function LabelsProperty({ entity, readOnly }: { entity: EntityRecord; readOnly: boolean }) {
  const theme = useTheme();
  const { data: labels = [] } = useLabels(entity.spaceId);
  const { data: attached = [] } = useEntityLabels(entity.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const toggle = useLocalWrite((db, input: { labelId: string; on: boolean }) =>
    input.on
      ? attachLabel(db, entity.id, input.labelId)
      : detachLabel(db, entity.id, input.labelId),
  );
  const add = useLocalWrite(async (db, label: string) => {
    const id = await createLabel(db, entity.spaceId, label);
    await attachLabel(db, entity.id, id);
  });
  const on = new Set(attached.map((l) => l.id));
  const submit = () => name.trim() && add.mutate(name, { onSuccess: () => setName("") });
  return (
    <Property
      icon={<IconTag size={20} color={theme.colors.mutedForeground} />}
      label="Labels"
      value={attached.length === 0 ? "None" : attached.map((l) => l.name).join(", ")}
      disabled={readOnly}
      expanded={open}
      onPress={() => setOpen((o) => !o)}
    >
      {labels.length > 0 ? (
        <ChipGroup label="Labels" multiple>
          {labels.map((label) => (
            <Chip
              key={label.id}
              multiple
              label={label.name}
              selected={on.has(label.id)}
              icon={
                <View className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
              }
              onPress={() => toggle.mutate({ labelId: label.id, on: !on.has(label.id) })}
            />
          ))}
        </ChipGroup>
      ) : null}
      <View className="flex-row items-end gap-2">
        <View className="flex-1">
          <Field
            label="New label"
            placeholder="Urgent"
            value={name}
            onChangeText={setName}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </View>
        <Button
          variant="secondary"
          label="Add"
          status={statusOf(add)}
          disabled={!name.trim()}
          errorLabel="Couldn't add"
          onPress={submit}
        />
      </View>
    </Property>
  );
}

/// The labels of an item that has no card of properties of its own: one row.
export function LabelsSection({ entity, readOnly }: { entity: EntityRecord; readOnly: boolean }) {
  const { data: attached = [] } = useEntityLabels(entity.id);
  if (readOnly && attached.length === 0) return null;
  return (
    <PropertyList>
      <LabelsProperty entity={entity} readOnly={readOnly} />
    </PropertyList>
  );
}

/// Picks an item to link to, from search or Recents.
export function LinkPickerScreen({ entityId }: { entityId: string }) {
  const [typeName, setTypeName] = useState("relates-to");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { data: results = [] } = useSearch(query);
  const { data: recent = [] } = useRecents();
  const { data: related = [] } = useRelated(entityId);
  const link = useLocalWrite((db, otherId: string) =>
    createRelationship(db, entityId, otherId, typeName),
  );
  const linked = new Set([
    entityId,
    ...(typeName === "relates-to" ? related.map((r) => r.entity.id) : []),
  ]);
  const searching = query.trim().length > 0;
  const shown = (searching ? results : recent).filter((e) => !linked.has(e.id));
  return (
    <Screen>
      <Field
        label="Find an item"
        autoFocus
        placeholder="Titles, keys like TSK-14, page text"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <ChipGroup label="Kind of link" scroll>
        {RELATIONSHIP_TYPES.filter((t) => t.creatable).map((t) => (
          <Chip
            key={t.name}
            label={t.label}
            selected={t.name === typeName}
            onPress={() => setTypeName(t.name)}
          />
        ))}
      </ChipGroup>
      {link.error ? <Text tone="destructive">{link.error.message}</Text> : null}
      <Section title={searching ? "Results" : "Recents"}>
        {shown.length === 0 ? (
          <Empty text={searching ? "Nothing matches." : "Search for an item to link."} />
        ) : null}
        {shown.map((entity) => (
          <View key={entity.id}>
            <Row
              title={entity.title || "Untitled"}
              subtitle={entity.key}
              icon={<EntityIcon type={entity.type} icon={entity.icon} />}
              accessibilityHint="Links it"
              onPress={() => link.mutate(entity.id, { onSuccess: () => router.back() })}
            />
          </View>
        ))}
      </Section>
    </Screen>
  );
}
