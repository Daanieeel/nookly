import {
  RECIPE_KINDS,
  type RecipeItem,
  type RecipeRecord,
  type RecipeStep,
  createIngredient,
  createRecipe,
  createStep,
  deleteIngredient,
  deleteStep,
  moveIngredient,
  moveStep,
  setRecipeBanner,
  setRecipeDuration,
  setRecipeKind,
  setRecipeTags,
  updateIngredient,
  updateStep,
} from "@nookly/shared/data";
import { useEntityMenu } from "./entity-actions.tsx";
import {
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconToolsKitchen2,
  IconTrash,
} from "@tabler/icons-react-native";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { storePicked } from "../data/files.ts";
import { useRecipe, useRecipeParts, useRecipeTags, useRecipes } from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Grid } from "../ui/Grid.tsx";
import { ListTitle } from "../ui/ListBar.tsx";
import { Field } from "../ui/Field.tsx";

import { cn } from "../ui/classes.ts";
import { DetailsPart, MainPart } from "../ui/parts.tsx";
import { Empty, ROW_DIVIDER, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { MultiSelectField, SelectField } from "../ui/SelectField.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { SpacePicker } from "./SpacePicker.tsx";
import { useQuery } from "@tanstack/react-query";
import { useSpaces } from "../data/queries.ts";

const KIND_LABELS = ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Other"];

const minutes = (total: number | null) =>
  total === null
    ? null
    : total >= 60
      ? `${Math.floor(total / 60)} h ${total % 60} min`
      : `${total} min`;

/// A Space's recipes: their kind, how long they take, their tags.
export function RecipeRows({ spaceId }: { spaceId: string }) {
  const theme = useTheme();
  const { data: recipes = [] } = useRecipes(spaceId);
  if (recipes.length === 0) {
    return (
      <View className="items-center gap-2 p-8">
        <IconToolsKitchen2 size={28} color={theme.colors.mutedForeground} />
        <Text tone="muted" className="text-center">
          No recipes yet. Add a recipe to start tracking its ingredients and steps.
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-4">
      <ListTitle title="Recipes" count={recipes.length} />
      <Grid min={240} max={4}>
        {recipes.map((recipe) => (
          <RecipeCard key={recipe.entity.id} recipe={recipe} />
        ))}
      </Grid>
    </View>
  );
}

/// A recipe as a card: its banner (a food icon when it has none), name and key, what kind of
/// meal it is, how long it takes and its tags.
function RecipeCard({ recipe }: { recipe: RecipeRecord }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const theme = useTheme();
  const banner = recipe.bannerPath;
  const shown = useBannerExists(banner);
  const kind = KIND_LABELS[RECIPE_KINDS.findIndex((k) => k === recipe.kind)] ?? "Other";
  const time = minutes(recipe.totalDurationMinutes);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recipe.entity.title || "Untitled"}
      onPress={() => router.push(`/entity/${recipe.entity.id}`)}
      onLongPress={() => entityMenu(recipe.entity)}
      className={cn(CARD_CLASSES, "gap-0 overflow-hidden py-0 active:opacity-80")}
    >
      <View className="h-24 items-center justify-center bg-muted">
        {banner && shown ? (
          <Image source={{ uri: banner }} resizeMode="cover" className="size-full" />
        ) : (
          <IconToolsKitchen2 size={30} color={theme.colors.mutedForeground} />
        )}
      </View>
      <View className="gap-2 p-3">
        <View className="flex-row items-baseline gap-2">
          <Text numberOfLines={1} className="flex-1 font-medium">
            {recipe.entity.title || "Untitled"}
          </Text>
          <Text variant="small" tone="muted">
            {recipe.entity.key}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge label={kind} size="sm" />
          {time ? (
            <View className="flex-row items-center gap-1">
              <IconClock size={12} color={theme.colors.mutedForeground} />
              <Text variant="small" tone="muted">
                {time}
              </Text>
            </View>
          ) : null}
        </View>
        {recipe.tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-1">
            {recipe.tags.map((t) => (
              <Badge key={t.id} label={t.name} size="sm" />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/// New Recipe: a title first; the rest is on its page.
export function NewRecipeScreen({ spaceId }: { spaceId?: string }) {
  const router = useRouter();
  const close = useCloseSheet();
  const { data: spaces = [] } = useSpaces();
  const [chosen, setChosen] = useState<string | null>(spaceId ?? null);
  const space = chosen ?? spaces[0]?.id ?? null;
  const [title, setTitle] = useState("");
  const create = useLocalWrite((db, name: string) => {
    if (!space) throw new Error("Pick a Space");
    return createRecipe(db, space, name);
  });
  const submit = () =>
    create.mutate(title.trim(), { onSuccess: (id) => close(() => router.push(`/entity/${id}`)) });
  return (
    <Screen>
      <SpacePicker value={space} onChange={setChosen} />
      <Field
        label="Title"
        autoFocus
        placeholder="Pancakes"
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={submit}
      />
      <Button
        label="New Recipe"
        status={statusOf(create)}
        errorLabel="Couldn't create"
        onPress={submit}
      />
    </Screen>
  );
}

/// An ingredient or a step: its text to edit in place, its place in the list, and trash.
function Part({
  item,
  index,
  count,
  onText,
  onMove,
  onDelete,
  readOnly,
  extra,
}: {
  item: RecipeItem;
  index: number;
  count: number;
  onText: (text: string) => void;
  onMove: (to: number) => void;
  onDelete: () => void;
  readOnly: boolean;
  extra?: React.ReactNode;
}) {
  const theme = useTheme();
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.text]);
  return (
    <View className={cn("gap-2 p-3", ROW_DIVIDER)}>
      <Field
        label={`Text ${index + 1}`}
        multiline
        editable={!readOnly}
        value={text}
        onChangeText={setText}
        onEndEditing={() => text.trim() && text !== item.text && onText(text.trim())}
      />
      {extra}
      {!readOnly ? (
        <View className="flex-row items-center justify-end gap-1">
          <IconButton
            label="Move Up"
            icon={<IconChevronUp size={18} color={theme.colors.foreground} />}
            onPress={() => index > 0 && onMove(index - 1)}
          />
          <IconButton
            label="Move Down"
            icon={<IconChevronDown size={18} color={theme.colors.foreground} />}
            onPress={() => index < count - 1 && onMove(index + 1)}
          />
          <IconButton
            label="Delete"
            icon={<IconTrash size={18} color={theme.colors.destructive} />}
            onPress={onDelete}
          />
        </View>
      ) : null}
    </View>
  );
}

function StepDuration({
  step,
  onChange,
}: {
  step: RecipeStep;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(
    step.durationMinutes === null ? "" : String(step.durationMinutes),
  );
  useEffect(
    () => setText(step.durationMinutes === null ? "" : String(step.durationMinutes)),
    [step.durationMinutes],
  );
  return (
    <Field
      label="Minutes"
      keyboardType="number-pad"
      value={text}
      onChangeText={setText}
      onEndEditing={() => {
        const value = text.trim() === "" ? null : Number.parseInt(text, 10);
        if (value === null || (Number.isInteger(value) && value >= 0)) onChange(value);
      }}
    />
  );
}

function AddLine({ label, onAdd }: { label: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (text.trim()) {
      onAdd(text.trim());
      setText("");
    }
  };
  return (
    <View className="flex-row items-end gap-2 p-3">
      <View className="flex-1">
        <Field
          label={label}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
      </View>
      <Button label={`Add ${label}`} variant="secondary" onPress={submit} />
    </View>
  );
}

/// A recipe's own page: kind, time, tags, banner, ingredients and steps.
export function RecipeDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const { data: recipe } = useRecipe(id);
  const { data: catalog = [] } = useRecipeTags();
  const { data: parts } = useRecipeParts(id);
  const [duration, setDuration] = useState("");
  const stored = recipe?.durationMinutes ?? null;
  useEffect(() => setDuration(stored === null ? "" : String(stored)), [stored]);
  const kind = useLocalWrite((db, value: string) => setRecipeKind(db, id, value));
  const time = useLocalWrite((db, value: number | null) => setRecipeDuration(db, id, value));
  const tags = useLocalWrite((db, ids: string[]) => setRecipeTags(db, id, ids));
  const banner = useLocalWrite(async (db, _: undefined) => {
    const picked = await File.pickFileAsync({ mimeTypes: "image/*" });
    if (picked.canceled) return;
    await setRecipeBanner(db, id, (await storePicked(picked.result)).uri);
  });
  const addIngredient = useLocalWrite((db, text: string) => createIngredient(db, id, text));
  const editIngredient = useLocalWrite((db, i: { id: string; text: string }) =>
    updateIngredient(db, i.id, i.text),
  );
  const moveIng = useLocalWrite((db, i: { id: string; to: number }) =>
    moveIngredient(db, i.id, i.to),
  );
  const dropIngredient = useLocalWrite((db, ingredient: string) =>
    deleteIngredient(db, ingredient),
  );
  const addStep = useLocalWrite((db, text: string) => createStep(db, id, text));
  const editStep = useLocalWrite(
    (db, s: { id: string; patch: { text?: string; durationMinutes?: number | null } }) =>
      updateStep(db, s.id, s.patch),
  );
  const moveSt = useLocalWrite((db, s: { id: string; to: number }) => moveStep(db, s.id, s.to));
  const dropStep = useLocalWrite((db, step: string) => deleteStep(db, step));
  const bannerUri = recipe?.bannerPath ?? null;
  const bannerExists = useBannerExists(bannerUri);
  if (!recipe) return null;
  const chosen = recipe.tags.map((t) => t.id);
  return (
    <>
      <MainPart>
        {bannerUri && bannerExists ? (
          <Image
            accessibilityLabel="Banner"
            source={{ uri: bannerUri }}
            resizeMode="cover"
            className="h-40 w-full rounded-lg bg-muted"
          />
        ) : recipe.bannerBlob ? (
          <Text tone="muted">
            The banner is in your account and arrives when this phone has synced.
          </Text>
        ) : null}
        {!readOnly ? (
          <View className="items-start">
            <Button
              label="Choose Banner"
              variant="ghost"
              status={statusOf(banner)}
              errorLabel="Couldn't use it"
              onPress={() => banner.mutate(undefined)}
            />
          </View>
        ) : null}
        <Section title="Ingredients">
          {parts?.ingredients.length === 0 ? <Empty text="No ingredients yet." /> : null}
          {parts?.ingredients.map((item, index) => (
            <View key={item.id}>
              <Part
                item={item}
                index={index}
                count={parts.ingredients.length}
                readOnly={readOnly}
                onText={(text) => editIngredient.mutate({ id: item.id, text })}
                onMove={(to) => moveIng.mutate({ id: item.id, to })}
                onDelete={() => dropIngredient.mutate(item.id)}
              />
            </View>
          ))}
          {!readOnly ? (
            <AddLine label="Ingredient" onAdd={(text) => addIngredient.mutate(text)} />
          ) : null}
        </Section>
        <Section title="Steps">
          {parts?.steps.length === 0 ? <Empty text="No steps yet." /> : null}
          {parts?.steps.map((item, index) => (
            <View key={item.id}>
              <Part
                item={item}
                index={index}
                count={parts.steps.length}
                readOnly={readOnly}
                onText={(text) => editStep.mutate({ id: item.id, patch: { text } })}
                onMove={(to) => moveSt.mutate({ id: item.id, to })}
                onDelete={() => dropStep.mutate(item.id)}
                extra={
                  <StepDuration
                    step={item}
                    onChange={(value) =>
                      editStep.mutate({ id: item.id, patch: { durationMinutes: value } })
                    }
                  />
                }
              />
            </View>
          ))}
          {!readOnly ? <AddLine label="Step" onAdd={(text) => addStep.mutate(text)} /> : null}
        </Section>
      </MainPart>
      <DetailsPart>
        <Section title="Kind">
          <View className="p-3">
            <SelectField
              label="Kind"
              showLabel={false}
              disabled={readOnly}
              value={recipe.kind}
              options={RECIPE_KINDS.map((value, index) => ({
                id: value,
                label: KIND_LABELS[index],
              }))}
              onChange={(value) => kind.mutate(value)}
            />
          </View>
        </Section>
        <Section
          title={
            recipe.durationMinutes === null && recipe.totalDurationMinutes !== null
              ? `Time, ${minutes(recipe.totalDurationMinutes)} from the steps`
              : "Time"
          }
        >
          <View className="p-3">
            <Field
              label="Minutes"
              keyboardType="number-pad"
              editable={!readOnly}
              placeholder="Add up the steps"
              value={duration}
              onChangeText={setDuration}
              onEndEditing={() => {
                const value = duration.trim() === "" ? null : Number.parseInt(duration, 10);
                if (value === null || (Number.isInteger(value) && value >= 0)) time.mutate(value);
              }}
            />
          </View>
        </Section>
        <Section title="Tags">
          <View className="p-3">
            <MultiSelectField
              label="Tags"
              disabled={readOnly}
              values={chosen}
              options={catalog.map((tag) => ({ id: tag.id, label: tag.name }))}
              onChange={(ids) => tags.mutate(ids)}
            />
          </View>
        </Section>
      </DetailsPart>
    </>
  );
}

/// Whether the banner's file is on this phone: it may still be on its way.
function useBannerExists(uri: string | null) {
  const { data } = useQuery({
    queryKey: ["banner-exists", uri],
    enabled: Boolean(uri),
    queryFn: () => (uri ? new File(uri).exists : false),
  });
  return Boolean(data);
}
