import { useRouter } from "expo-router";
import { useEntityMenu } from "./entity-actions.tsx";
import { EntitySwipe } from "./EntitySwipe.tsx";
import { useState } from "react";
import { View } from "react-native";
import { IconFolder, IconTag } from "@tabler/icons-react-native";
import { SEARCH_TABS } from "@nookly/frontend/lib/search-results";
import { useAllLabels, useRecents, useSearch, useSpaces } from "../data/queries.ts";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { SearchField } from "../ui/kit/SearchField.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { ListControls } from "../ui/ListControls.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import type { EntityRecord, LabelRecord } from "@nookly/shared/data";
import { labelOption, spaceOption } from "./option-badges.tsx";

function Results({ entities, empty }: { entities: EntityRecord[]; empty: string }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  if (entities.length === 0) return <Empty text={empty} />;
  return entities.map((entity) => (
    <View key={entity.id}>
      <EntitySwipe entity={entity}>
        <Row
          title={entity.title || "Untitled"}
          subtitle={entity.key}
          icon={<EntityIcon type={entity.type} icon={entity.icon} />}
          onPress={() => router.push(`/entity/${entity.id}`)}
          onLongPress={() => entityMenu(entity)}
        />
      </EntitySwipe>
    </View>
  ));
}

/// One label per name: Spaces each have their own, and search matches them by name, as the
/// desktop's `#` does.
function byName(labels: LabelRecord[]): LabelRecord[] {
  const seen = new Set<string>();
  return labels.filter((label) => {
    const name = label.name.toLowerCase();
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

/// Search across every Space, like the desktop's Cmd+K: its type tabs, and a Filter sheet
/// for what it types as `in:` (Spaces) and `#` (labels). Before typing, Recents.
export function SearchScreen() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string | null>(null);
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const { data: spaces = [] } = useSpaces();
  const { data: allLabels = [] } = useAllLabels();
  const types = SEARCH_TABS.find((t) => t.key === tab)?.types;
  const { data: results = [] } = useSearch(query, { types, spaceIds, labels });
  const { data: recent = [] } = useRecents();
  const searching = query.trim().length > 0;
  // As the desktop: recents narrow by type and Space, and a label filter leaves none.
  const recentShown =
    labels.length > 0
      ? []
      : recent.filter(
          (e) =>
            (!types || types.includes(e.type)) &&
            (spaceIds.length === 0 || spaceIds.includes(e.spaceId)),
        );
  const shown = searching ? results : recentShown;
  const filtered = tab !== null || spaceIds.length > 0 || labels.length > 0;
  return (
    <Screen>
      <SearchField
        label="Search"
        value={query}
        onChangeText={setQuery}
      />
      <ChipGroup label="Result type" scroll>
        {[{ key: null, label: "All" }, ...SEARCH_TABS].map((t) => (
          <Chip
            key={t.label}
            label={t.label}
            selected={tab === t.key}
            onPress={() => setTab(t.key)}
          />
        ))}
      </ChipGroup>
      <ListControls
        title={searching ? "Results" : "Recents"}
        count={shown.length}
        filters={[
          {
            label: "Space",
            icon: IconFolder,
            values: spaceIds,
            options: spaces.map(spaceOption),
            onChange: setSpaceIds,
          },
          {
            label: "Labels",
            icon: IconTag,
            values: labels,
            options: byName(allLabels).map((label) => ({ ...labelOption(label), id: label.name })),
            onChange: setLabels,
          },
        ]}
      />
      <Section>
        <Results
          entities={shown}
          empty={searching || filtered ? "Nothing matches." : "Nothing opened yet."}
        />
      </Section>
    </Screen>
  );
}
