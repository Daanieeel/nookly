import { type LabelRecord } from "@nookly/shared/data";
import { type LabelCounts, UNLABELLED, labelCounts, togglePick } from "@nookly/shared/label-shelf";
import { IconTag, IconTagOff } from "@tabler/icons-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button, IconButton } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Field } from "../ui/Field.tsx";
import { GroupedSection } from "../ui/kit/GroupedSection.tsx";
import { ListRow } from "../ui/kit/ListRow.tsx";
import { OptionList, type Option } from "../ui/sheet/OptionList.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { SPACE } from "../ui/tokens.ts";
import { labelOption } from "./option-badges.tsx";

/// The Space's labels with how many files carry each, most used first, then the files
/// without one: what a View of some labels is made of (D81).
export type FileLabelCounts = LabelCounts<LabelRecord>;

export function fileLabelCounts(
  files: { labelIds: string[] }[],
  labels: LabelRecord[],
): FileLabelCounts {
  return labelCounts(files, (f) => f.labelIds, labels);
}

const filesCount = (n: number) => (n === 1 ? "1 file" : `${n} files`);

function labelChoices(counts: FileLabelCounts): Option[] {
  const labels = counts.labels.map(({ label, count }) => ({
    ...labelOption(label),
    detail: filesCount(count),
  }));
  if (counts.unlabelled === 0) return labels;
  return [
    ...labels,
    {
      id: UNLABELLED,
      label: "Files without a label",
      glyph: IconTagOff,
      detail: filesCount(counts.unlabelled),
      separatorBefore: labels.length > 0,
    },
  ];
}

/// The labels to tick: the files carrying every label ticked show, or only those without one.
function LabelChoice({
  counts,
  picked,
  onChange,
}: {
  counts: FileLabelCounts;
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <OptionList
      label="Labels"
      multiple
      dense
      search
      values={picked}
      options={labelChoices(counts)}
      onToggle={(id) => onChange(togglePick(picked, id))}
    />
  );
}

function nameOf(labels: LabelRecord[], id: string) {
  return id === UNLABELLED
    ? "Files without a label"
    : (labels.find((l) => l.id === id)?.name ?? id);
}

/// The labels the page or its View shows the files of, above the files: only the ones
/// picked, each to take off, and a sheet to change them. Nothing shows while none is picked,
/// so a Space with many labels keeps a quiet page.
export function PickedLabels({
  picked,
  labels,
  counts,
  onChange,
  showsFiles,
}: {
  picked: string[];
  labels: LabelRecord[];
  counts: FileLabelCounts;
  onChange: (next: string[]) => void;
  /// Whether any file is shown, for the nudge under the files without a label.
  showsFiles: boolean;
}) {
  const theme = useTheme();
  const [choosing, setChoosing] = useState(false);
  const live = picked.filter((id) => id === UNLABELLED || labels.some((l) => l.id === id));
  const sheet = (
    <Sheet open={choosing} onOpenChange={setChoosing} title="Labels" kind="picker">
      <LabelChoice counts={counts} picked={live} onChange={onChange} />
    </Sheet>
  );
  // The sheet stays open after its last label is taken off, to pick another.
  if (live.length === 0) return sheet;
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <ChipGroup label="Labels shown" scroll multiple>
            {live.map((id) => (
              <Chip
                key={id}
                label={`${nameOf(labels, id)} ×`}
                multiple
                selected
                onPress={() => onChange(live.filter((x) => x !== id))}
              />
            ))}
          </ChipGroup>
        </View>
        <IconButton
          label="Change Labels"
          variant="secondary"
          icon={<IconTag size={18} color={theme.colors.foreground} />}
          onPress={() => setChoosing(true)}
        />
      </View>
      {live.includes(UNLABELLED) && showsFiles ? (
        <Text variant="small" tone="muted">
          Give these a label and they show under every View of that label.
        </Text>
      ) : null}
      {sheet}
    </View>
  );
}

/// The desktop's New View dialog for Files: a name and the labels whose files it shows. It
/// keeps the page's filters and display too.
export function NewFileView({
  open,
  onOpenChange,
  labels,
  counts,
  picked: initial,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: LabelRecord[];
  counts: FileLabelCounts;
  /// The labels the page shows now, ticked to begin with.
  picked: string[];
  onCreate: (name: string, picked: string[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(initial);
  const [choosing, setChoosing] = useState(false);
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setPicked(initial);
      setStatus("idle");
    }
  }
  const summary =
    picked.length === 0 ? "Every file" : picked.map((id) => nameOf(labels, id)).join(", ");
  const create = async () => {
    const title = name.trim();
    if (!title) return;
    setStatus("pending");
    try {
      await onCreate(title, picked);
      onOpenChange(false);
    } catch {
      setStatus("error");
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="New View">
      <View style={{ gap: SPACE.lg }}>
        <Field
          label="View name"
          placeholder="Lecture slides"
          value={name}
          onChangeText={setName}
          autoFocus
        />
        <GroupedSection
          margin={0}
          footer="Shows the files that carry every label ticked. Keeps this page's filters and display too."
        >
          <ListRow
            title="Labels"
            detail={summary}
            accessory="chevron"
            accessibilityLabel={`Labels, ${summary}`}
            onPress={() => setChoosing(true)}
          />
        </GroupedSection>
        <Button
          label="Create View"
          status={status === "pending" ? "pending" : status === "error" ? "error" : "idle"}
          errorLabel="Couldn't create"
          disabled={name.trim().length === 0}
          onPress={() => void create()}
        />
      </View>
      <Sheet open={choosing} onOpenChange={setChoosing} title="Labels" kind="picker">
        <LabelChoice counts={counts} picked={picked} onChange={setPicked} />
      </Sheet>
    </Sheet>
  );
}
