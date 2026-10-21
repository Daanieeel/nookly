import { useSpaces } from "../data/queries.ts";
import { SpaceDot } from "../ui/Badge.tsx";
import { SelectField } from "../ui/SelectField.tsx";

/// Which Space something new goes into: every entity belongs to exactly one. The desktop's
/// Space select; its Spaces open in a sheet.
export function SpacePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (spaceId: string) => void;
}) {
  const { data: spaces = [] } = useSpaces();
  return (
    <SelectField
      label="Space"
      value={value}
      onChange={onChange}
      empty="Make a Space first, with + next to Spaces in the sidebar."
      options={spaces.map((space) => ({
        id: space.id,
        label: space.name,
        icon: <SpaceDot color={space.color} />,
      }))}
    />
  );
}
