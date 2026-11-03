import { useInvalidateRecipe } from "./use-invalidate-recipe.ts";
import { type DurationUnit, IngredientsSection, StepsSection, toUnit } from "./RecipeLists";
import { qk } from "#/lib/query-keys.ts";
import { IconCamera, IconToolsKitchen2 } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { type ReactNode, useEffect, useState } from "react";
import { EntityDetailLayout } from "#/components/entity-detail-layout.tsx";
import { updateEntity } from "#/lib/api/entities.ts";
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
  getRecipe,
  listRecipeTags,
  setRecipeBanner,
  updateRecipeDuration,
  updateRecipeKind,
  updateRecipeTags,
} from "#/lib/api/recipes.ts";
import type { Entity, Recipe, RecipeKind } from "#/lib/api/types.ts";
import { RECIPE_KIND_ICONS, RECIPE_KIND_LABELS, RECIPE_KINDS } from "./recipe-kind.ts";
import { RecipeTagsPicker, RecipeTagsTrigger } from "./recipe-tags.tsx";

export function RecipeDetailView({ entity }: { entity: Entity }) {
  const { data: recipe } = useQuery({
    queryKey: qk.recipes.byId(entity.id),
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
  const invalidate = useInvalidateRecipe(entity.id);

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.entity.byId(entity.id) }),
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
  const invalidate = useInvalidateRecipe(entity.id);

  const { data: catalog = [] } = useQuery({
    queryKey: qk.recipes.tags,
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
    const minutes = Math.round(unit === "h" ? next * 60 : next);
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
            step={unit === "h" ? 0.5 : 5}
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
              <SelectItem value="h">h</SelectItem>
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
