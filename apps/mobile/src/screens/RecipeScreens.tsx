import { usePageFilters } from "../ui/page-filters.tsx";
import { ListEmpty } from "../ui/ListEmpty.tsx";
import { MODULE_ICONS } from "../ui/icons.tsx";
import { EmptyState } from "../ui/kit/States.tsx";
import { livePath } from "../data/reroot.ts";
import { lineInput } from "../ui/kit/line-input.ts";
import {
  RECIPE_KINDS,
  RECIPE_TIME_BUCKETS,
  recipeTime,
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
import { FormSection } from "../ui/kit/Form.tsx";
import {
  IconArrowDown,
  IconArrowUp,
  IconCamera,
  IconClock,
  IconDots,
  IconFile,
  IconPhoto,
  IconPlus,
  IconTag,
  IconToolsKitchen2,
  IconTrash,
} from "@tabler/icons-react-native";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, TextInput, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { type PhotoSource, usePhotoPicker } from "../ui/photo-picker.tsx";
import { useRecipe, useRecipeParts, useRecipeTags, useRecipes } from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { useMenu } from "../ui/menu.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { ChoiceProperty, NumberRow, SheetProperty } from "../ui/property-rows.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { CORNER, RADIUS } from "../ui/tokens.ts";
import { useSemantic } from "../ui/kit/scheme.ts";
import { labelSummary } from "./ComposeForm.tsx";
import { Badge } from "../ui/Badge.tsx";
import { RecipeTagChip } from "./RecipeTagChip.tsx";
import { Grid } from "../ui/Grid.tsx";
import { ListControls } from "../ui/ListControls.tsx";
import { useEntityFilters } from "../ui/entity-filters.tsx";
import { Field } from "../ui/Field.tsx";

import { cn } from "../ui/classes.ts";
import { DetailsPart, MainPart } from "../ui/parts.tsx";
import { Empty, ROW_DIVIDER, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
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
  const { data: recipes = [] } = useRecipes(spaceId);
  const filters = usePageFilters(`recipes.filters.${spaceId}`);
  const kinds = filters.picked("kind");
  const tags = filters.picked("tags");
  const times = filters.picked("time");
  const own = useEntityFilters(filters.entity, filters.setEntity);
  const usedTags = [
    ...new Map(recipes.flatMap((r) => r.tags.map((t) => [t.id, t] as const))).values(),
  ];
  const shown = recipes.filter(
    (r) =>
      (kinds.length === 0 || kinds.includes(r.kind)) &&
      (tags.length === 0 || r.tags.some((t) => tags.includes(t.id))) &&
      (times.length === 0 || times.includes(recipeTime(r.totalDurationMinutes))) &&
      own.passes(r.entity),
  );
  if (recipes.length === 0) {
    return (
      <EmptyState
        glyph={MODULE_ICONS.recipes}
        title="No Recipes"
        message="Add a recipe to start tracking its ingredients and steps."
      />
    );
  }
  return (
    <View className="gap-4">
      <ListControls
        title="Recipes"
        count={recipes.length}
        filters={[
          {
            label: "Kind",
            icon: IconToolsKitchen2,
            values: kinds,
            options: RECIPE_KINDS.map((k, i) => ({ id: k, label: KIND_LABELS[i] ?? k })),
            onChange: filters.pick("kind"),
          },
          {
            label: "Tags",
            icon: IconTag,
            values: tags,
            options: usedTags.map((t) => ({ id: t.id, label: t.name, tint: t.color })),
            onChange: filters.pick("tags"),
          },
          {
            label: "Time",
            icon: IconClock,
            values: times,
            options: RECIPE_TIME_BUCKETS,
            onChange: filters.pick("time"),
          },
          ...own.fields,
        ]}
      />
      <ListEmpty
        glyph={MODULE_ICONS.recipes}
        total={recipes.length}
        shown={shown.length}
        nothingYet={{ title: "No Recipes" }}
        onClear={filters.clear}
      />
      <Grid min={240} max={4}>
        {shown.map((recipe) => (
          <RecipeCard key={recipe.entity.id} recipe={recipe} />
        ))}
      </Grid>
      {filters.saveBar}
    </View>
  );
}

/// A recipe as a card: its banner (a food icon when it has none), name and key, what kind of
/// meal it is, how long it takes and its tags.
function RecipeCard({ recipe }: { recipe: RecipeRecord }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const theme = useTheme();
  const banner = livePath(recipe.bannerPath);
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
              <RecipeTagChip key={t.id} tag={t} />
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
      <FormSection>
        <SpacePicker value={space} onChange={setChosen} />
        <Field
          label="Title"
          autoFocus
          placeholder="Pancakes"
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={submit}
        />
      </FormSection>
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
/// One ingredient or step: its number, its text typed in place, and a menu to move or delete
/// it, so the text has the whole width.
function Part({
  noun,
  item,
  index,
  count,
  onText,
  onMove,
  onDelete,
  readOnly,
  extra,
}: {
  noun: "Ingredient" | "Step";
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
  const menu = useMenu();
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.text]);
  const name = `${noun} ${index + 1}`;
  return (
    <View className={cn("flex-row items-start gap-3 py-2", ROW_DIVIDER)}>
      <Text tone="muted" className="w-6 pt-2.5 text-center font-medium tabular-nums">
        {noun === "Step" ? `${index + 1}.` : "•"}
      </Text>
      <View className="flex-1 gap-1">
        <TextInput
          accessibilityLabel={name}
          multiline
          scrollEnabled={false}
          editable={!readOnly}
          value={text}
          onChangeText={setText}
          onEndEditing={() => text.trim() && text !== item.text && onText(text.trim())}
          onBlur={() => text.trim() && text !== item.text && onText(text.trim())}
          className="min-h-11 py-2.5 font-sans text-base text-foreground"
        />
        {extra}
      </View>
      {!readOnly ? (
        <IconButton
          label={`More for ${name}`}
          icon={<IconDots size={18} color={theme.colors.mutedForeground} />}
          onPress={() =>
            menu.show(name, [
              ...(index > 0
                ? [{ label: "Move Up", icon: IconArrowUp, onPress: () => onMove(index - 1) }]
                : []),
              ...(index < count - 1
                ? [{ label: "Move Down", icon: IconArrowDown, onPress: () => onMove(index + 1) }]
                : []),
              { label: `Delete ${noun}`, icon: IconTrash, destructive: true, onPress: onDelete },
            ])
          }
        />
      ) : null}
    </View>
  );
}

/// A step's minutes, small under its text: a clock and the number.
function StepDuration({
  name,
  step,
  readOnly,
  onChange,
}: {
  name: string;
  step: RecipeStep;
  readOnly: boolean;
  onChange: (value: number | null) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(
    step.durationMinutes === null ? "" : String(step.durationMinutes),
  );
  useEffect(
    () => setText(step.durationMinutes === null ? "" : String(step.durationMinutes)),
    [step.durationMinutes],
  );
  if (readOnly && step.durationMinutes === null) return null;
  return (
    <View className="flex-row items-center gap-1.5">
      <IconClock size={14} color={theme.colors.mutedForeground} />
      <TextInput
        accessibilityLabel={`Minutes for ${name}`}
        keyboardType="number-pad"
        editable={!readOnly}
        placeholder="Minutes"
        placeholderTextColor={theme.colors.mutedForeground}
        value={text}
        onChangeText={setText}
        onEndEditing={() => {
          const value = text.trim() === "" ? null : Number.parseInt(text, 10);
          if (value === null || (Number.isInteger(value) && value >= 0)) onChange(value);
        }}
        className="h-8 min-w-16 font-sans text-sm text-muted-foreground"
      />
      {text.trim() ? (
        <Text variant="small" tone="muted">
          min
        </Text>
      ) : null}
    </View>
  );
}

/// The row that adds one more: a plus and a field across the width; its button only shows
/// once there is something to add, and the return key adds it too.
function AddLine({ noun, onAdd }: { noun: "Ingredient" | "Step"; onAdd: (text: string) => void }) {
  const theme = useTheme();
  const [text, setText] = useState("");
  const submit = () => {
    if (text.trim()) {
      onAdd(text.trim());
      setText("");
    }
  };
  return (
    <View className="min-h-12 flex-row items-center gap-3">
      <View className="w-6 items-center">
        <IconPlus size={18} color={theme.colors.mutedForeground} />
      </View>
      <TextInput
        accessibilityLabel={`New ${noun.toLowerCase()}`}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder={noun === "Ingredient" ? "Add an ingredient" : "Add a step"}
        placeholderTextColor={theme.colors.mutedForeground}
        className="h-12 flex-1 text-foreground"
        style={lineInput("callout")}
      />
      {text.trim() ? (
        <Button label={`Add ${noun}`} variant="secondary" size="sm" onPress={submit} />
      ) : null}
    </View>
  );
}

/// The banner across the top, as on the desktop: the picture, or a quiet placeholder with
/// the kitchen icon; a small camera button in its corner adds or changes it.
function RecipeBanner({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const { data: recipe } = useRecipe(id);
  const menu = useMenu();
  const photos = usePhotoPicker();
  const pick = useLocalWrite(async (db, source: PhotoSource) => {
    const uri = await photos.pick(source);
    if (uri) await setRecipeBanner(db, id, uri);
  });
  const uri = livePath(recipe?.bannerPath ?? null);
  const exists = useBannerExists(uri);
  const shown = Boolean(uri && exists);
  const fill = useSemantic("fill");
  return (
    <View className="gap-2">
      <View
        style={[CORNER, { borderRadius: RADIUS.section, backgroundColor: fill }]}
        className="h-40 overflow-hidden"
      >
        {shown && uri ? (
          <Image
            accessibilityLabel="Banner"
            source={{ uri }}
            resizeMode="cover"
            className="size-full"
          />
        ) : (
          <View
            accessibilityLabel={
              recipe?.bannerBlob ? "The banner arrives when this phone has synced" : "No banner"
            }
            className="size-full items-center justify-center"
          >
            <View style={{ opacity: 0.4 }}>
              <IconToolsKitchen2 size={32} color={theme.colors.mutedForeground} />
            </View>
          </View>
        )}
        {!readOnly ? (
          <View className="absolute top-2 right-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={shown ? "Change Banner Image" : "Add Banner Image"}
              onPress={() =>
                menu.show(shown ? "Change Banner Image" : "Add Banner Image", [
                  {
                    label: "Photo Library",
                    icon: IconPhoto,
                    onPress: () => pick.mutate("library"),
                  },
                  { label: "Take Photo", icon: IconCamera, onPress: () => pick.mutate("camera") },
                  { label: "Choose File", icon: IconFile, onPress: () => pick.mutate("file") },
                ])
              }
              hitSlop={8}
              style={({ pressed }) => [
                CORNER,
                {
                  width: 34,
                  height: 34,
                  borderRadius: RADIUS.control,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.4)",
                },
              ]}
            >
              <IconCamera size={17} color="#ffffff" />
            </Pressable>
          </View>
        ) : null}
      </View>
      {pick.error ? (
        <Text variant="small" tone="destructive">
          {pick.error.message}
        </Text>
      ) : null}
    </View>
  );
}

/// A recipe's own page: banner, ingredients and steps; its kind, time and tags in the details.
export function RecipeDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const { data: recipe } = useRecipe(id);
  const { data: catalog = [] } = useRecipeTags();
  const { data: parts } = useRecipeParts(id);
  const kind = useLocalWrite((db, value: string) => setRecipeKind(db, id, value));
  const time = useLocalWrite((db, value: number | null) => setRecipeDuration(db, id, value));
  const tags = useLocalWrite((db, ids: string[]) => setRecipeTags(db, id, ids));
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
  if (!recipe) return null;
  const muted = theme.colors.mutedForeground;
  const chosen = recipe.tags.map((t) => t.id);
  const fromSteps = recipe.durationMinutes === null ? minutes(recipe.totalDurationMinutes) : null;
  return (
    <>
      <MainPart>
        <RecipeBanner id={id} readOnly={readOnly} />
        <Section title="Ingredients">
          {readOnly && parts?.ingredients.length === 0 ? (
            <Empty text="No ingredients yet." />
          ) : null}
          {parts?.ingredients.map((item, index) => (
            <Part
              key={item.id}
              noun="Ingredient"
              item={item}
              index={index}
              count={parts.ingredients.length}
              readOnly={readOnly}
              onText={(text) => editIngredient.mutate({ id: item.id, text })}
              onMove={(to) => moveIng.mutate({ id: item.id, to })}
              onDelete={() => dropIngredient.mutate(item.id)}
            />
          ))}
          {!readOnly ? (
            <AddLine noun="Ingredient" onAdd={(text) => addIngredient.mutate(text)} />
          ) : null}
        </Section>
        <Section title="Steps">
          {readOnly && parts?.steps.length === 0 ? <Empty text="No steps yet." /> : null}
          {parts?.steps.map((item, index) => (
            <Part
              key={item.id}
              noun="Step"
              item={item}
              index={index}
              count={parts.steps.length}
              readOnly={readOnly}
              onText={(text) => editStep.mutate({ id: item.id, patch: { text } })}
              onMove={(to) => moveSt.mutate({ id: item.id, to })}
              onDelete={() => dropStep.mutate(item.id)}
              extra={
                <StepDuration
                  name={`Step ${index + 1}`}
                  step={item}
                  readOnly={readOnly}
                  onChange={(value) =>
                    editStep.mutate({ id: item.id, patch: { durationMinutes: value } })
                  }
                />
              }
            />
          ))}
          {!readOnly ? <AddLine noun="Step" onAdd={(text) => addStep.mutate(text)} /> : null}
        </Section>
      </MainPart>
      <DetailsPart>
        <PropertyList>
          <ChoiceProperty
            icon={<IconToolsKitchen2 size={20} color={muted} />}
            label="Kind"
            value={recipe.kind}
            readOnly={readOnly}
            options={RECIPE_KINDS.map((value, index) => ({ id: value, label: KIND_LABELS[index] }))}
            onChange={(value) => kind.mutate(value)}
          />
          <NumberRow
            icon={<IconClock size={20} color={muted} />}
            label="Time"
            value={recipe.durationMinutes}
            placeholder={fromSteps ? `${fromSteps} from the steps` : "Minutes"}
            readOnly={readOnly}
            onSave={(value) => time.mutate(value === null ? null : Math.round(value))}
          />
          <SheetProperty
            icon={<IconTag size={20} color={muted} />}
            label="Tags"
            value={
              labelSummary(catalog.filter((t) => chosen.includes(t.id)).map((t) => t.name)) ??
              "None"
            }
            empty={chosen.length === 0}
            readOnly={readOnly}
          >
            <OptionList
              label="Tags"
              search
              multiple
              values={chosen}
              options={catalog.map((tag) => ({ id: tag.id, label: tag.name }))}
              onToggle={(tagId, on) =>
                tags.mutate(on ? [...chosen, tagId] : chosen.filter((t) => t !== tagId))
              }
            />
          </SheetProperty>
        </PropertyList>
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
