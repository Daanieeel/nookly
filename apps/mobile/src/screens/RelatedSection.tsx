import {
  type EntityRecord,
  attachLabel,
  createLabel,
  detachLabel,
  relate,
  unrelate,
} from "@nookly/shared/data";
import { IconLinkOff, IconPlus } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useEntityLabels, useLabels, useRecents, useRelated, useSearch } from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Field } from "../ui/Field.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row, Section, Separator } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { useTheme } from "../ui/theme.ts";

/// Items linked to this one, either way round, like the desktop's Related section.
export function RelatedSection({ entity, readOnly }: { entity: EntityRecord; readOnly: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: related = [] } = useRelated(entity.id);
  const remove = useLocalWrite((db, relationshipId: string) => unrelate(db, relationshipId));
  return (
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
      {related.length === 0 ? <Empty text="Nothing linked yet." /> : null}
      {related.map((item, i) => (
        <View key={item.relationshipId}>
          {i > 0 ? <Separator /> : null}
          <Row
            title={item.entity.title || "Untitled"}
            subtitle={item.entity.key}
            icon={<EntityIcon type={item.entity.type} icon={item.entity.icon} />}
            onPress={() => router.push(`/entity/${item.entity.id}`)}
            trailing={
              readOnly ? undefined : (
                <IconButton
                  label={`Unlink ${item.entity.title || "Untitled"}`}
                  icon={<IconLinkOff size={18} color={theme.colors.mutedForeground} />}
                  onPress={() => remove.mutate(item.relationshipId)}
                />
              )
            }
          />
        </View>
      ))}
    </Section>
  );
}

/// The Space's labels as chips: tap to put one on or take it off, or name a new one.
export function LabelsSection({ entity, readOnly }: { entity: EntityRecord; readOnly: boolean }) {
  const theme = useTheme();
  const { data: labels = [] } = useLabels(entity.spaceId);
  const { data: attached = [] } = useEntityLabels(entity.id);
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
  if (readOnly && attached.length === 0) return null;
  return (
    <Section title="Labels">
      <View style={{ padding: theme.space(3), gap: theme.space(3) }}>
        {labels.length > 0 ? (
          <ChipGroup label="Labels" multiple>
            {(readOnly ? attached : labels).map((label) => (
              <Chip
                key={label.id}
                multiple
                label={label.name}
                color={label.color}
                selected={on.has(label.id)}
                disabled={readOnly}
                icon={
                  <View
                    style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: label.color }}
                  />
                }
                onPress={() => toggle.mutate({ labelId: label.id, on: !on.has(label.id) })}
              />
            ))}
          </ChipGroup>
        ) : null}
        {!readOnly ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: theme.space(2) }}>
            <View style={{ flex: 1 }}>
              <Field
                label="New label"
                placeholder="Urgent"
                value={name}
                onChangeText={setName}
                returnKeyType="done"
                onSubmitEditing={() =>
                  name.trim() && add.mutate(name, { onSuccess: () => setName("") })
                }
              />
            </View>
            <Button
              label="Add"
              status={statusOf(add)}
              disabled={!name.trim()}
              errorLabel="Couldn't add"
              onPress={() => add.mutate(name, { onSuccess: () => setName("") })}
            />
          </View>
        ) : null}
      </View>
    </Section>
  );
}

/// Picks an item to link to, from search or Recents.
export function LinkPickerScreen({ entityId }: { entityId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { data: results = [] } = useSearch(query);
  const { data: recent = [] } = useRecents();
  const { data: related = [] } = useRelated(entityId);
  const link = useLocalWrite((db, otherId: string) => relate(db, entityId, otherId));
  const linked = new Set([entityId, ...related.map((r) => r.entity.id)]);
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
      <Section title={searching ? "Results" : "Recents"}>
        {shown.length === 0 ? (
          <Empty text={searching ? "Nothing matches." : "Search for an item to link."} />
        ) : null}
        {shown.map((entity, i) => (
          <View key={entity.id}>
            {i > 0 ? <Separator /> : null}
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
