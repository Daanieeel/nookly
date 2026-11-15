import { ACCENT_COLORS } from "@nookly/shared/colors";
import {
  addSpaceModule,
  deleteLabel,
  deleteSpace,
  listEntities,
  removeSpaceModule,
  reorderSpaceModules,
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
import { IconChevronRight, IconLayoutGridAdd, IconTrash } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useDb, useLocalWrite } from "../data/context.tsx";
import { useLabels, useSpaceModules, useSpaces } from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { MODULE_ICONS } from "../ui/icons.tsx";
import { cn } from "../ui/classes.ts";
import { Empty, ROW_DIVIDER, Row, Section } from "../ui/Row.tsx";
import { FormSection } from "../ui/kit/Form.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { useMenu } from "../ui/menu.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { ColorChoices } from "../ui/kit/ColorChoices.tsx";
import { ReorderList } from "../ui/ReorderList.tsx";
import { SpaceIconChoices } from "../ui/SpaceIconChoices.tsx";
import { TYPE } from "../ui/tokens.ts";

/// A module's row height, which a drag moves by.
const MODULE_ROW = 56;

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
    <ColorChoices
      label={label}
      colors={ACCENT_COLORS}
      value={value}
      onChange={(c) => c && onPick(c)}
    />
  );
}

/// One label of the Space: its colour and name; a tap opens its sheet to rename it, change
/// its colour or delete it, so a long list of labels stays a list.
function LabelRow({ id, name, color }: { id: string; name: string; color: string }) {
  const theme = useTheme();
  const menu = useMenu();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(name);
  useEffect(() => setText(name), [name]);
  const update = useLocalWrite((db, patch: { name?: string; color?: string; icon?: string }) =>
    updateLabel(db, id, patch),
  );
  const remove = useLocalWrite((db) => deleteLabel(db, id));
  return (
    <>
      <Row
        title={name}
        icon={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />}
        trailing={<IconChevronRight size={18} color={theme.colors.mutedForeground} />}
        accessibilityHint="Rename it, change its colour or delete it"
        onPress={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen} title={name} presentation="card">
        <View className="gap-5">
          <FormSection>
            <Field
              label={`Name of ${name}`}
              value={text}
              onChangeText={setText}
              onEndEditing={() => {
                if (text.trim() && text !== name) update.mutate({ name: text });
              }}
              error={update.error?.message}
            />
          </FormSection>
          <Swatches
            label={`Color of ${name}`}
            value={color}
            onPick={(c) => update.mutate({ color: c })}
          />
          <Button
            label="Delete Label"
            variant="ghost"
            icon={<IconTrash size={18} color={theme.colors.destructive} />}
            onPress={() => {
              setOpen(false);
              menu.confirm({
                title: "Delete this label?",
                description: `"${name}" comes off every item that has it.`,
                actions: [
                  { label: "Delete", destructive: true, onPress: () => remove.mutate(undefined) },
                ],
              });
            }}
          />
        </View>
      </Sheet>
    </>
  );
}

/// A Space's settings: name, icon and color, which modules it has and in what order (dragged
/// into place), its labels, and deleting it. Its place among the Spaces is dragged in the
/// sidebar.
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
  const update = useLocalWrite((db, patch: { name?: string; color?: string; icon?: string }) =>
    updateSpace(db, spaceId, patch),
  );
  const reorder = useLocalWrite((db, keys: string[]) => reorderSpaceModules(db, spaceId, keys));
  const add = useLocalWrite((db, key: string) => addSpaceModule(db, spaceId, key));
  const remove = useLocalWrite((db, input: { key: string; trash: boolean }) =>
    removeSpaceModule(db, spaceId, input.key, input.trash),
  );
  const destroy = useLocalWrite((db) => deleteSpace(db, spaceId));
  const [adding, setAdding] = useState(false);
  const db = useDb();
  if (!space) return null;
  const shown = modules.filter(isModuleKey);
  const more = ADDABLE.filter((key) => !shown.includes(key));
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
        <SpaceIconChoices
          value={space.icon}
          color={space.color}
          onPick={(icon) => update.mutate({ icon })}
          onChooseEmoji={() =>
            router.push({
              pathname: "/pick/icon",
              params: { kind: "space", id: spaceId, only: "emoji" },
            })
          }
        />
        {more.length > 0 ? (
          <Button
            label="Add Module"
            variant="secondary"
            size="lg"
            icon={<IconLayoutGridAdd size={18} color={theme.colors.foreground} />}
            onPress={() => setAdding(true)}
          />
        ) : null}
        <Sheet open={adding} onOpenChange={setAdding} title="Add Module" presentation="card">
          <OptionList
            label="Modules"
            search
            value={null}
            options={more.map((key) => ({
              id: key,
              label: MODULE_LABELS[key],
              glyph: MODULE_ICONS[key],
              tint: space.color,
            }))}
            onChange={(key) => {
              setAdding(false);
              add.mutate(key);
            }}
          />
        </Sheet>
        <Section title="Modules">
          {shown.length === 0 ? <Empty text="No modules yet." /> : null}
          <ReorderList
            items={shown}
            keyOf={(key) => key}
            labelOf={(key) => MODULE_LABELS[key]}
            size={MODULE_ROW}
            onReorder={(keys) => reorder.mutate(keys)}
            renderItem={(key) => {
              const Icon = MODULE_ICONS[key];
              return (
                <View
                  className={cn("flex-row items-center gap-3 pl-4", ROW_DIVIDER)}
                  style={{ minHeight: MODULE_ROW }}
                >
                  <Icon size={22} color={theme.colors.mutedForeground} />
                  <Text className="flex-1" style={{ fontSize: TYPE.body.fontSize }}>
                    {MODULE_LABELS[key]}
                  </Text>
                  {removalGroup(key).length > 0 ? (
                    <IconButton
                      label={`Remove ${MODULE_LABELS[key]}`}
                      icon={<IconTrash size={20} color={theme.colors.destructive} />}
                      onPress={() => askRemove(key)}
                    />
                  ) : null}
                </View>
              );
            }}
          />
        </Section>
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
              onPress={async () => {
                // Counted when asked, so it is what goes now.
                const count = (await listEntities(db, { spaceId })).length;
                menu.confirm({
                  title: `Delete "${space.name}"?`,
                  description:
                    "This permanently deletes the Space and everything in it, across all its modules. This cannot be undone; nothing goes to Trash.",
                  stats: [{ value: count, label: count === 1 ? "Item" : "Items" }],
                  phrase: space.name,
                  actions: [
                    {
                      label: "Delete Space",
                      destructive: true,
                      onPress: () =>
                        destroy.mutate(undefined, { onSuccess: () => router.dismissAll() }),
                    },
                  ],
                });
              }}
            />
          </View>
        </Section>
      </Screen>
    </>
  );
}
