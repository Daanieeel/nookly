import {
  type EntityRecord,
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
  useLinks,
  useMentions,
  useRecents,
  useRelated,
  useSearch,
} from "../data/queries.ts";
import { IconButton } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { SheetProperty } from "../ui/property-rows.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { SelectField } from "../ui/SelectField.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { LabelPicker } from "./EntityPickers.tsx";

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
  const [linking, setLinking] = useState(false);
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
              onPress={() => setLinking(true)}
            />
          )
        }
      >
        {others.length === 0 ? <Empty text="Nothing linked yet." /> : others.map(linkRow)}
      </Section>
      <Sheet open={linking} onOpenChange={setLinking} title="Relate to…" size="large">
        <LinkPicker entityId={entity.id} />
      </Sheet>
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

/// The Space's labels as a property row: its value is the labels on the item; tapped, the
/// Space's labels in a sheet (tap to put one on or take it off, or type a new one).
export function LabelsProperty({ entity, readOnly }: { entity: EntityRecord; readOnly: boolean }) {
  const theme = useTheme();
  const { data: attached = [] } = useEntityLabels(entity.id);
  return (
    <SheetProperty
      icon={<IconTag size={20} color={theme.colors.mutedForeground} />}
      label="Labels"
      value={attached.length === 0 ? "None" : attached.map((l) => l.name).join(", ")}
      readOnly={readOnly}
    >
      <LabelPicker entityId={entity.id} spaceId={entity.spaceId} />
    </SheetProperty>
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
export function LinkPicker({ entityId }: { entityId: string }) {
  const [typeName, setTypeName] = useState("relates-to");
  const close = useCloseSheet();
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
    <View className="gap-4">
      <Field
        label="Find an item"
        autoFocus
        placeholder="Titles, keys like TSK-14, page text"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <SelectField
        label="Kind of link"
        value={typeName}
        options={RELATIONSHIP_TYPES.filter((t) => t.creatable).map((t) => ({
          id: t.name,
          label: t.label,
        }))}
        onChange={setTypeName}
      />
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
              onPress={() => link.mutate(entity.id, { onSuccess: () => close() })}
            />
          </View>
        ))}
      </Section>
    </View>
  );
}
