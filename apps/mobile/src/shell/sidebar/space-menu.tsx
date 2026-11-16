import { ACCENT_COLORS } from "@nookly/shared/colors";
import type { Space } from "@nookly/shared/data";
import {
  IconLayoutGridAdd,
  IconPalette,
  IconPencil,
  IconMoodSmile,
  IconSettings,
  IconTag,
  IconTrash,
} from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  AddModuleList,
  useAddableModules,
  useAskDeleteSpace,
  useUpdateSpace,
} from "../../screens/space-actions.tsx";
import { Button } from "../../ui/Button.tsx";
import { Field } from "../../ui/Field.tsx";
import { ColorChoices } from "../../ui/kit/ColorChoices.tsx";
import { SEPARATOR, type MenuEntry } from "../../ui/menu.tsx";
import { useSheet } from "../../ui/sheet/Sheet.tsx";
import { SpaceIconChoices } from "../../ui/SpaceIconChoices.tsx";
import { workspace } from "../workspace-store.ts";

/// The desktop sidebar's Space menu (`space-menu`), as a popover on a tablet: Rename,
/// Change Icon and Change Color as steps inside it, Labels and Space Settings as a page,
/// Add Module as a step, and Delete Space asked for in a dialog.

function Rename({ space }: { space: Space }) {
  const sheet = useSheet();
  const update = useUpdateSpace(space.id);
  const [name, setName] = useState(space.name);
  const save = () => {
    if (name.trim() && name !== space.name) update.mutate({ name: name.trim() });
    sheet?.close();
  };
  return (
    <View className="gap-3 p-1">
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        autoFocus
        selectTextOnFocus
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <Button label="Rename" onPress={save} disabled={!name.trim()} />
    </View>
  );
}

function ChangeIcon({ space }: { space: Space }) {
  const sheet = useSheet();
  const router = useRouter();
  const update = useUpdateSpace(space.id);
  return (
    <SpaceIconChoices
      value={space.icon}
      color={space.color}
      onPick={(icon) => update.mutate({ icon })}
      onChooseEmoji={() =>
        sheet?.close(() =>
          router.push({
            pathname: "/pick/icon",
            params: { kind: "space", id: space.id, only: "emoji" },
          }),
        )
      }
    />
  );
}

function ChangeColor({ space }: { space: Space }) {
  const update = useUpdateSpace(space.id);
  return (
    <ColorChoices
      label="Color"
      colors={ACCENT_COLORS}
      value={space.color}
      onChange={(color) => color && update.mutate({ color })}
    />
  );
}

function AddModule({ space }: { space: Space }) {
  const sheet = useSheet();
  return <AddModuleList space={space} onAdded={() => sheet?.close()} />;
}

export function useSpaceMenu(space: Space): MenuEntry[] {
  const router = useRouter();
  const more = useAddableModules(space.id);
  const { ask } = useAskDeleteSpace(space);
  return [
    { label: "Rename", icon: IconPencil, page: () => <Rename space={space} /> },
    { label: "Change Icon", icon: IconMoodSmile, page: () => <ChangeIcon space={space} /> },
    { label: "Change Color", icon: IconPalette, page: () => <ChangeColor space={space} /> },
    SEPARATOR,
    {
      label: "Labels",
      icon: IconTag,
      onPress: () => router.push(`/space-settings/${space.id}`),
    },
    ...(more.length > 0
      ? [{ label: "Add Module", icon: IconLayoutGridAdd, page: () => <AddModule space={space} /> }]
      : []),
    {
      label: "Space Settings",
      icon: IconSettings,
      onPress: () => workspace.open(`/space-settings/${space.id}`),
    },
    SEPARATOR,
    { label: "Delete Space", icon: IconTrash, destructive: true, onPress: () => void ask() },
  ];
}
