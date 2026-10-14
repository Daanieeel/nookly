import { useSpaces } from "../data/queries.ts";
import { SpaceDot } from "../ui/Badge.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Text } from "../ui/Text.tsx";

/// Which Space something new goes into: every entity belongs to exactly one.
export function SpacePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (spaceId: string) => void;
}) {
  const { data: spaces = [] } = useSpaces();
  if (spaces.length === 0)
    return <Text tone="muted">Make a Space first, with + next to Spaces in the sidebar.</Text>;
  return (
    <ChipGroup label="Space" scroll>
      {spaces.map((space) => (
        <Chip
          key={space.id}
          label={space.name}
          color={space.color}
          selected={space.id === value}
          icon={<SpaceDot color={space.color} />}
          onPress={() => onChange(space.id)}
        />
      ))}
    </ChipGroup>
  );
}
