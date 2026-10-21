import { ACCENT_COLORS } from "@nookly/shared/colors";
import {
  addSpaceModule,
  deleteLabel,
  deleteSpace,
  removeSpaceModule,
  reorderSpaceModules,
  reorderSpaces,
  updateLabel,
  updateSpace,
} from "@nookly/shared/data";
import {
  MODULE_KEYS,
  MODULE_LABELS,
  type ModuleKey,
  isModuleKey,
  removalGroup,
} from "@nookly/shared/modules";
import { IconChevronDown, IconChevronUp, IconPlus, IconTrash } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useLabels, useSpaceModules, useSpaces } from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { IconValue, MODULE_ICONS } from "../ui/icons.tsx";
import { cn } from "../ui/classes.ts";
import { Empty, ROW_DIVIDER, Row, Section } from "../ui/Row.tsx";
import { useMenu } from "../ui/menu.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { Swatch } from "../ui/Swatch.tsx";

/// Modules offered under Add Module: all of them but the passenger that comes with Courses.
const ADDABLE = MODULE_KEYS.filter((key) => key !== "semesters");

function Swatches({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="-mx-2.5 flex-row flex-wrap"
    >
      {ACCENT_COLORS.map((c) => (
        <Swatch
          key={c}
          label={`${label} ${c}`}
          color={c}
          selected={c === value}
          onPress={() => onPick(c)}
        />
      ))}
    </View>
  );
}

/// One label of the Space: its name, its color, and deleting it.
function LabelRow({ id, name, color }: { id: string; name: string; color: string }) {
  const menu = useMenu();
  const [text, setText] = useState(name);
  useEffect(() => setText(name), [name]);
  const update = useLocalWrite((db, patch: { name?: string; color?: string }) =>
    updateLabel(db, id, patch),
  );
  const remove = useLocalWrite((db) => deleteLabel(db, id));
  return (
    <View className={cn("gap-3 p-4", ROW_DIVIDER)}>
      <Field
        label={`Label ${name}`}
        value={text}
        onChangeText={setText}
        onEndEditing={() => {
          if (text.trim() && text !== name) update.mutate({ name: text });
        }}
        error={update.error?.message}
      />
      <Swatches
        label={`Color of ${name}`}
        value={color}
        onPick={(c) => update.mutate({ color: c })}
      />
      <Button
        label="Delete Label"
        variant="ghost"
        onPress={() =>
          menu.confirm({
            title: "Delete this label?",
            description: `"${name}" comes off every item that has it.`,
            actions: [
              { label: "Delete", destructive: true, onPress: () => remove.mutate(undefined) },
            ],
          })
        }
      />
    </View>
  );
}

/// A Space's settings: name, icon and color, its place among the Spaces, which
/// modules it has and in what order, its labels, and deleting it.
export function SpaceSettingsScreen({ spaceId }: { spaceId: string }) {
  const menu = useMenu();
  const theme = useTheme();
  const router = useRouter();
  const { data: spaces = [] } = useSpaces();
  const { data: modules = [] } = useSpaceModules(spaceId);
  const { data: labels = [] } = useLabels(spaceId);
  const space = spaces.find((s) => s.id === spaceId);
  const [name, setName] = useState(space?.name ?? "");
  useEffect(() => setName(space?.name ?? ""), [space?.name]);
  const update = useLocalWrite((db, patch: { name?: string; color?: string }) =>
    updateSpace(db, spaceId, patch),
  );
  const order = useLocalWrite((db, ids: string[]) => reorderSpaces(db, ids));
  const reorder = useLocalWrite((db, keys: string[]) => reorderSpaceModules(db, spaceId, keys));
  const add = useLocalWrite((db, key: string) => addSpaceModule(db, spaceId, key));
  const remove = useLocalWrite((db, input: { key: string; trash: boolean }) =>
    removeSpaceModule(db, spaceId, input.key, input.trash),
  );
  const destroy = useLocalWrite((db) => deleteSpace(db, spaceId));
  if (!space) return null;
  const shown = modules.filter(isModuleKey);
  const more = ADDABLE.filter((key) => !shown.includes(key));
  const at = spaces.findIndex((s) => s.id === spaceId);
  const move = (list: string[], from: number, to: number) => {
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  };
  const askRemove = (key: ModuleKey) =>
    menu.confirm({
      title: `Remove ${MODULE_LABELS[key]}?`,
      description:
        "Hide keeps everything, and brings it back when you add the module again. Trash moves it to Trash.",
      actions: [
        { label: "Hide", onPress: () => remove.mutate({ key, trash: false }) },
        {
          label: "Move to Trash",
          destructive: true,
          onPress: () => remove.mutate({ key, trash: true }),
        },
      ],
    });
  return (
    <>
      <Stack.Screen options={{ title: "Space Settings" }} />
      <Screen>
        <View className="gap-4">
          <Field
            label="Name"
            required
            value={name}
            onChangeText={setName}
            onEndEditing={() => {
              if (name.trim() && name !== space.name) update.mutate({ name });
            }}
            error={update.error?.message}
          />
          <Swatches
            label="Color"
            value={space.color}
            onPick={(color) => update.mutate({ color })}
          />
        </View>
        <Section>
          <Row
            title="Icon"
            icon={space.icon ? <IconValue value={space.icon} fallback={space.color} /> : undefined}
            subtitle={space.icon ? undefined : "Folder"}
            onPress={() =>
              router.push({ pathname: "/pick/icon", params: { kind: "space", id: spaceId } })
            }
          />
          <View className={cn("flex-row items-center gap-1 px-4 py-2", ROW_DIVIDER)}>
            <Text className="flex-1">Position</Text>
            <IconButton
              label="Move Space Up"
              icon={<IconChevronUp size={18} color={theme.colors.foreground} />}
              onPress={() =>
                at > 0 &&
                order.mutate(
                  move(
                    spaces.map((s) => s.id),
                    at,
                    at - 1,
                  ),
                )
              }
            />
            <IconButton
              label="Move Space Down"
              icon={<IconChevronDown size={18} color={theme.colors.foreground} />}
              onPress={() =>
                at < spaces.length - 1 &&
                order.mutate(
                  move(
                    spaces.map((s) => s.id),
                    at,
                    at + 1,
                  ),
                )
              }
            />
          </View>
        </Section>
        <Section title="Modules">
          {shown.length === 0 ? <Empty text="No modules yet." /> : null}
          {shown.map((key, index) => {
            const Icon = MODULE_ICONS[key];
            return (
              <View key={key} className={cn("flex-row items-center gap-1 px-4 py-1", ROW_DIVIDER)}>
                <Icon size={18} color={theme.colors.mutedForeground} />
                <Text className="ml-2 flex-1">{MODULE_LABELS[key]}</Text>
                <IconButton
                  label={`Move ${MODULE_LABELS[key]} Up`}
                  icon={<IconChevronUp size={18} color={theme.colors.foreground} />}
                  onPress={() => index > 0 && reorder.mutate(move(shown, index, index - 1))}
                />
                <IconButton
                  label={`Move ${MODULE_LABELS[key]} Down`}
                  icon={<IconChevronDown size={18} color={theme.colors.foreground} />}
                  onPress={() =>
                    index < shown.length - 1 && reorder.mutate(move(shown, index, index + 1))
                  }
                />
                {removalGroup(key).length > 0 ? (
                  <IconButton
                    label={`Remove ${MODULE_LABELS[key]}`}
                    icon={<IconTrash size={18} color={theme.colors.destructive} />}
                    onPress={() => askRemove(key)}
                  />
                ) : null}
              </View>
            );
          })}
        </Section>
        {more.length > 0 ? (
          <View className="items-start">
            <Button
              label="Add Module"
              variant="secondary"
              icon={<IconPlus size={16} color={theme.colors.foreground} />}
              onPress={() =>
                menu.show(
                  "Add Module",
                  more.map((key) => ({
                    label: MODULE_LABELS[key],
                    icon: MODULE_ICONS[key],
                    onPress: () => add.mutate(key),
                  })),
                )
              }
            />
          </View>
        ) : null}
        <Section title="Labels">
          {labels.length === 0 ? <Empty text="No labels in this Space yet." /> : null}
          {labels.map((label) => (
            <View key={label.id}>
              <LabelRow id={label.id} name={label.name} color={label.color} />
            </View>
          ))}
        </Section>
        <Section title="Delete Space">
          <View className="gap-3 p-4">
            <Text tone="muted">
              Deletes the Space and everything in it, for good. A Space has no Trash.
            </Text>
            <Button
              label="Delete Space"
              variant="destructive"
              status={statusOf(destroy)}
              errorLabel="Couldn't delete"
              onPress={() =>
                menu.confirm({
                  title: `Delete "${space.name}" forever?`,
                  description: "Everything in it goes, on every device. This can't be undone.",
                  actions: [
                    {
                      label: "Delete Forever",
                      destructive: true,
                      onPress: () =>
                        destroy.mutate(undefined, { onSuccess: () => router.dismissAll() }),
                    },
                  ],
                })
              }
            />
          </View>
        </Section>
      </Screen>
    </>
  );
}
