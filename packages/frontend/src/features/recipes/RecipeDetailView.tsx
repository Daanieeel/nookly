import { IconCamera, IconGripVertical, IconToolsKitchen2, IconTrash, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { EntityDetailLayout } from "#/components/entity-detail-layout.tsx";
import { updateEntity } from "#/lib/api/entities.ts";
import { Input } from "@nookly/ui/components/input";
import { NumberInput } from "@nookly/ui/components/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { Separator } from "@nookly/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import {
  createIngredient,
  createStep,
  deleteIngredient,
  deleteStep,
  getRecipe,
  listIngredients,
  listRecipeTags,
  listSteps,
  setRecipeBanner,
  updateIngredient,
  updateRecipeDuration,
  updateRecipeKind,
  updateRecipeTags,
  updateStep,
} from "#/lib/api/recipes.ts";
import type { Entity, Recipe, RecipeKind, RecipeStep } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";
import { RECIPE_KIND_ICONS, RECIPE_KIND_LABELS, RECIPE_KINDS } from "./recipe-kind.ts";
import { RecipeTagsPicker, RecipeTagsTrigger } from "./recipe-tags.tsx";

type DurationUnit = "min" | "hr";

function toUnit(minutes: number, unit: DurationUnit): number {
  return unit === "hr" ? Math.round((minutes / 60) * 10) / 10 : minutes;
}

export function RecipeDetailView({ entity }: { entity: Entity }) {
  const { data: recipe } = useQuery({
    queryKey: ["recipe", entity.id],
    queryFn: () => getRecipe(entity.id),
  });

  return (
    <EntityDetailLayout entity={entity}>
      {recipe && <RecipeBody entity={entity} recipe={recipe} />}
    </EntityDetailLayout>
  );
}

/// The banner bleeds full width regardless of window size; everything else —
/// including the title, which overlaps the banner's own bottom fade — reads
/// at the same width a markdown page (`PageDetailView`) uses.
function RecipeBody({ entity, recipe }: { entity: Entity; recipe: Recipe }) {
  return (
    <div className="flex flex-col gap-4">
      <RecipeBanner entity={entity} recipe={recipe} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <RecipeTitle entity={entity} />
        <RecipeProperties entity={entity} recipe={recipe} />
        <Separator />
        <IngredientsSection recipeId={entity.id} />
        <Separator />
        <StepsSection recipeId={entity.id} />
      </div>
    </div>
  );
}

/// Bleeds to the edges of the body panel (`EntityDetailLayout`'s own `p-4`),
/// unaffected by the reading-width column everything else in `RecipeBody`
/// sits in. `RecipeTitle` renders separately, inside that column, and
/// overlaps this banner's bottom fade via its own negative top margin.
function RecipeBanner({ entity, recipe }: { entity: Entity; recipe: Recipe }) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recipe", entity.id] }),
      // The gallery cards show kind, duration, tags and banner too.
      queryClient.invalidateQueries({ queryKey: ["recipes"] }),
    ]);

  const setBanner = useMutation({
    mutationFn: (path: string) => setRecipeBanner(entity.id, path),
    onSuccess: invalidate,
  });

  const pickBanner = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
    if (selected) setBanner.mutate(selected);
  };

  const src = recipe.bannerPath ? convertFileSrc(recipe.bannerPath) : null;

  return (
    <div className="-mx-4 -mt-4">
      <div className="group/banner relative flex h-55 items-start justify-end overflow-hidden">
        {src ? (
          <img
            src={src}
            alt=""
            className="recipe-banner-fade absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="recipe-banner-fade absolute inset-0 bg-muted" />
        )}
        {!src && (
          <div className="absolute inset-0 flex items-center justify-center">
            <IconToolsKitchen2 size={28} className="text-muted-foreground/40" />
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={pickBanner}
              className="relative m-2 flex size-8 shrink-0 items-center justify-center rounded-md bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/60 group-hover/banner:opacity-100 focus-visible:opacity-100"
            >
              <IconCamera size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{src ? "Change banner image" : "Add banner image"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/// A second, large title field over the banner's fade — writes through the
/// same `updateEntity` mutation `EntityDetailLayout`'s own thin title field
/// uses, so the two always agree.
function RecipeTitle({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(entity.title);
  useEffect(() => setTitle(entity.title), [entity.id, entity.title]);

  const rename = useMutation({
    mutationFn: (newTitle: string) => updateEntity(entity.id, { title: newTitle }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity", entity.id] }),
  });

  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => title.trim() && title !== entity.title && rename.mutate(title.trim())}
      placeholder="Untitled Recipe"
      disabled={!!entity.deletedAt}
      className="relative z-10 -mt-11 -ml-2 w-[calc(100%+0.5rem)] overflow-x-hidden overflow-y-visible text-ellipsis whitespace-nowrap bg-transparent p-1 font-heading text-3xl/snug font-semibold text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
    />
  );
}

/// A Notion-style property row: a small muted label above each control,
/// three fields side by side — Duration, Category, Tags.
function RecipeProperties({ entity, recipe }: { entity: Entity; recipe: Recipe }) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recipe", entity.id] }),
      // The gallery cards show kind, duration, tags and banner too.
      queryClient.invalidateQueries({ queryKey: ["recipes"] }),
    ]);

  const { data: catalog = [] } = useQuery({
    queryKey: ["recipe-tags"],
    queryFn: listRecipeTags,
    staleTime: Infinity, // fixed, not user-creatable in this version
  });

  const setKind = useMutation({
    mutationFn: (kind: RecipeKind) => updateRecipeKind(entity.id, kind),
    onSuccess: invalidate,
  });
  const setDuration = useMutation({
    mutationFn: (minutes: number | null) => updateRecipeDuration(entity.id, minutes),
    onSuccess: invalidate,
  });
  const toggleTag = useMutation({
    mutationFn: (tagId: string) => {
      const current = recipe.tags.map((t) => t.id);
      const next = current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId];
      return updateRecipeTags(entity.id, next);
    },
    onSuccess: invalidate,
  });

  const [unit, setUnit] = useState<DurationUnit>("min");
  // What's shown: the manual override, else the steps' sum, else 0. Stepping
  // sets the override; landing on 0 clears it back to automatic.
  const effectiveMinutes = recipe.durationMinutes ?? recipe.totalDurationMinutes ?? 0;
  const [duration, setDurationValue] = useState(() => toUnit(effectiveMinutes, unit));
  useEffect(() => {
    setDurationValue(toUnit(effectiveMinutes, unit));
  }, [effectiveMinutes, unit]);

  const changeDuration = (next: number) => {
    setDurationValue(next);
    const minutes = Math.round(unit === "hr" ? next * 60 : next);
    if (minutes === 0) {
      if (recipe.durationMinutes != null) setDuration.mutate(null);
    } else if (minutes !== recipe.durationMinutes) {
      setDuration.mutate(minutes);
    }
  };

  const KindIcon = RECIPE_KIND_ICONS[recipe.kind];

  return (
    <div className="grid grid-cols-3 gap-3 px-1">
      <PropertyField label="Duration">
        <div className="flex items-center gap-1.5">
          <NumberInput
            value={duration}
            onChange={changeDuration}
            min={0}
            step={unit === "hr" ? 0.5 : 5}
            className="min-w-0 flex-1"
          />
          <Select
            value={unit}
            // SAFETY: `v` only ever comes from the two `SelectItem`s below.
            onValueChange={(v) => setUnit(v as DurationUnit)}
          >
            <SelectTrigger size="sm" className="w-16 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="min">min</SelectItem>
              <SelectItem value="hr">hr</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PropertyField>

      <PropertyField label="Category">
        <Select
          value={recipe.kind}
          // SAFETY: `v` only ever comes from a `SelectItem` below, whose
          // values are drawn from `RECIPE_KINDS` itself.
          onValueChange={(v) => setKind.mutate(v as RecipeKind)}
        >
          <SelectTrigger size="sm" className="w-full">
            <span className="flex min-w-0 items-center gap-1.5">
              <KindIcon size={14} className="shrink-0 text-muted-foreground" />
              <SelectValue>{RECIPE_KIND_LABELS[recipe.kind]}</SelectValue>
            </span>
          </SelectTrigger>
          <SelectContent>
            {RECIPE_KINDS.map((kind) => {
              const Icon = RECIPE_KIND_ICONS[kind];
              return (
                <SelectItem key={kind} value={kind}>
                  <Icon size={14} className="text-muted-foreground" />
                  {RECIPE_KIND_LABELS[kind]}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </PropertyField>

      <PropertyField label="Tags">
        <RecipeTagsPicker
          tags={catalog}
          selected={recipe.tags.map((t) => t.id)}
          onToggle={(id) => !toggleTag.isPending && toggleTag.mutate(id)}
          pendingId={toggleTag.isPending ? toggleTag.variables : undefined}
          failedId={toggleTag.isError ? toggleTag.variables : undefined}
        >
          <button type="button" className="block w-full min-w-0 text-left">
            <RecipeTagsTrigger tags={recipe.tags} />
          </button>
        </RecipeTagsPicker>
      </PropertyField>
    </div>
  );
}

function PropertyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/// Two columns of bullet points, each backed by its own ingredient record. A
/// trailing blank input is always present; typing into it and blurring (or
/// Enter) creates the next ingredient and slides in a fresh blank one, so the
/// list never needs a separate "Add" button (§05 content-aware creation).
function IngredientsSection({ recipeId }: { recipeId: string }) {
  const queryClient = useQueryClient();
  const { data: ingredients = [] } = useQuery({
    queryKey: ["recipe-ingredients", recipeId],
    queryFn: () => listIngredients(recipeId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["recipe-ingredients", recipeId] });

  const add = useMutation({
    mutationFn: (text: string) => createIngredient(recipeId, text),
    onSuccess: invalidate,
  });
  const edit = useMutation({
    mutationFn: (vars: { id: string; text: string }) => updateIngredient(vars.id, vars.text),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteIngredient(id),
    onSuccess: invalidate,
  });

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Ingredients</h2>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {ingredients.map((ingredient) => (
          <BulletRow
            key={ingredient.id}
            value={ingredient.text}
            onCommit={(text) => {
              if (text.trim() === "") remove.mutate(ingredient.id);
              else if (text !== ingredient.text) edit.mutate({ id: ingredient.id, text });
            }}
            onRemove={() => remove.mutate(ingredient.id)}
          />
        ))}
        <NewBulletRow
          key={ingredients.length}
          onCommit={(text) => text.trim() && add.mutate(text.trim())}
        />
      </div>
      {ingredients.length === 0 && (
        <p className="text-xs text-muted-foreground">Type your first ingredient below.</p>
      )}
    </div>
  );
}

function BulletRow({
  value,
  onCommit,
  onRemove,
}: {
  value: string;
  onCommit: (text: string) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="group/row flex items-center gap-2">
      <span className="text-muted-foreground">•</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove ingredient"
        className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/row:opacity-100"
      >
        <IconX size={12} />
      </button>
    </div>
  );
}

/// The always-present blank row at the end of the list: typing and
/// committing hands the text up to the parent (which creates the record),
/// then this row itself resets to blank via its `key` bump in the parent.
function NewBulletRow({ onCommit }: { onCommit: (text: string) => void }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const commit = () => {
    if (text.trim()) {
      onCommit(text);
      setText("");
    }
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">•</span>
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            inputRef.current?.focus();
          }
        }}
        placeholder="Add an ingredient"
        className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

/// Same appear-a-new-blank-row mechanic as ingredients, numbered instead of
/// bulleted, each with its own optional duration that rolls up into the
/// recipe's automatic total when no manual override is set.
function StepsSection({ recipeId }: { recipeId: string }) {
  const queryClient = useQueryClient();
  const { data: steps = [] } = useQuery({
    queryKey: ["recipe-steps", recipeId],
    queryFn: () => listSteps(recipeId),
  });
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["recipe-steps", recipeId] });
    queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] });
    queryClient.invalidateQueries({ queryKey: ["recipes"] });
  };

  const add = useMutation({
    mutationFn: (vars: { text: string; duration: number | null }) =>
      createStep(recipeId, vars.text, vars.duration),
    onSuccess: invalidateAll,
  });
  const edit = useMutation({
    mutationFn: (vars: { id: string; text: string; duration: number | null }) =>
      updateStep(vars.id, vars.text, vars.duration),
    onSuccess: invalidateAll,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteStep(id),
    onSuccess: invalidateAll,
  });

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Steps</h2>
      <div className="flex flex-col">
        {steps.map((step, i) => (
          <StepRow
            key={step.id}
            index={i + 1}
            step={step}
            onCommit={(text, duration) => {
              if (text.trim() === "") remove.mutate(step.id);
              else if (text !== step.text || duration !== step.durationMinutes) {
                edit.mutate({ id: step.id, text, duration });
              }
            }}
            onRemove={() => remove.mutate(step.id)}
          />
        ))}
        <NewStepRow
          key={steps.length}
          index={steps.length + 1}
          onCommit={(text, duration) => text.trim() && add.mutate({ text: text.trim(), duration })}
        />
      </div>
      {steps.length === 0 && (
        <p className="text-xs text-muted-foreground">Type your first step below.</p>
      )}
    </div>
  );
}

function StepRow({
  index,
  step,
  onCommit,
  onRemove,
}: {
  index: number;
  step: RecipeStep;
  onCommit: (text: string, duration: number | null) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(step.text);
  const [duration, setDuration] = useState(step.durationMinutes?.toString() ?? "");
  useEffect(() => setText(step.text), [step.text]);
  useEffect(() => setDuration(step.durationMinutes?.toString() ?? ""), [step.durationMinutes]);

  const commit = () => {
    const trimmed = duration.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    onCommit(text, Number.isNaN(parsed) ? null : parsed);
  };

  return (
    <div className="group/row flex items-start gap-2 py-1.5">
      <IconGripVertical
        size={14}
        className="mt-1.5 shrink-0 text-muted-foreground/0 group-hover/row:text-muted-foreground/40"
      />
      <span className="mt-1 w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
        {index}.
      </span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        rows={1}
        className="min-w-0 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Input
        type="number"
        min={0}
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        onBlur={commit}
        placeholder="min"
        className={cn("mt-0.5 h-7 w-16 shrink-0 text-xs")}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove step"
        className="mt-1.5 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/row:opacity-100"
      >
        <IconTrash size={12} />
      </button>
    </div>
  );
}

function NewStepRow({
  index,
  onCommit,
}: {
  index: number;
  onCommit: (text: string, duration: number | null) => void;
}) {
  const [text, setText] = useState("");
  const [duration, setDuration] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const commit = () => {
    if (text.trim()) {
      const trimmed = duration.trim();
      const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
      onCommit(text, Number.isNaN(parsed) ? null : parsed);
      setText("");
      setDuration("");
    }
  };

  return (
    <div className="flex items-start gap-2 py-1.5">
      <IconGripVertical size={14} className="mt-1.5 shrink-0 text-muted-foreground/0" />
      <span className="mt-1 w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
        {index}.
      </span>
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
            inputRef.current?.focus();
          }
        }}
        rows={1}
        placeholder="Add a step"
        className="min-w-0 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Input
        type="number"
        min={0}
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        onBlur={commit}
        placeholder="min"
        className="mt-0.5 h-7 w-16 shrink-0 text-xs"
      />
      <span className="mt-1.5 size-5 shrink-0" />
    </div>
  );
}
