import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useRecents, useSearch } from "../data/queries.ts";
import { Field } from "../ui/Field.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import type { EntityRecord } from "@nookly/shared/data";

function Results({ entities, empty }: { entities: EntityRecord[]; empty: string }) {
  const router = useRouter();
  if (entities.length === 0) return <Empty text={empty} />;
  return entities.map((entity) => (
    <View key={entity.id}>
      <Row
        title={entity.title || "Untitled"}
        subtitle={entity.key}
        icon={<EntityIcon type={entity.type} icon={entity.icon} />}
        onPress={() => router.push(`/entity/${entity.id}`)}
      />
    </View>
  ));
}

/// Search across every Space, like the desktop's Cmd+K. Before typing, Recents.
export function SearchScreen() {
  const [query, setQuery] = useState("");
  const { data: results = [] } = useSearch(query);
  const { data: recent = [] } = useRecents();
  const searching = query.trim().length > 0;
  return (
    <Screen>
      <Field
        label="Search"
        placeholder="Titles, keys like TSK-14, page text"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
      <Section title={searching ? "Results" : "Recents"}>
        <Results
          entities={searching ? results : recent}
          empty={searching ? "Nothing matches." : "Nothing opened yet."}
        />
      </Section>
    </Screen>
  );
}
