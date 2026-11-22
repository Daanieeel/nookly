import { GroupedSection } from "../../ui/kit/GroupedSection.tsx";
import { IconBadge } from "../../ui/kit/IconBadge.tsx";
import { ListRow } from "../../ui/kit/ListRow.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { LEGAL_PAGES, openLegal } from "../legal.tsx";

/// Settings, Legal: the terms, the privacy policy, the imprint and the license, on nookly.work.
export function LegalPage() {
  return (
    <Screen grouped>
      <GroupedSection margin={0}>
        {LEGAL_PAGES.map(({ page, title, subtitle, glyph }) => (
          <ListRow
            key={page}
            badge={<IconBadge glyph={glyph} tint="gray" />}
            title={title}
            subtitle={subtitle}
            accessory="chevron"
            onPress={() => openLegal(page)}
          />
        ))}
      </GroupedSection>
    </Screen>
  );
}
