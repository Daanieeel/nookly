import { CreateNameDialog } from "#/features/CreateNameDialog.tsx";
import { qk } from "#/lib/query-keys.ts";
import { IconClock, IconPlus, IconTag, IconToolsKitchen2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useState } from "react";
import { contextTarget, entityTarget } from "#/components/context-menu/registry.ts";
import { EntityKey } from "#/components/entity-key.tsx";
import { NoMatchesNotice } from "#/components/module-view-header.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  GalleryCard,
  GalleryCardBody,
  GalleryCardImageBanner,
} from "@nookly/ui/components/gallery-card";
import { createRecipe, listRecipes } from "#/lib/api/recipes.ts";
import type { Recipe } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import {
  RECIPE_KINDS,
  RECIPE_KIND_LABELS,
  RECIPE_TIME_BUCKETS,
  recipeTime,
} from "./recipe-kind.ts";
import {
  type ActiveFilter,
  type FilterField,
  FilterMenu,
  applyFilters,
} from "#/components/filter-menu.tsx";
import { ENTITY_FILTER_FIELDS, entityFilterValue } from "#/features/tasks/shared-view-defs.tsx";
import { RecipeTagChip } from "./recipe-tags.tsx";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";

/// A card grid keyed off each recipe's own photo (§ Recipes module), not the
/// gradient-blob identity Courses uses — a recipe's banner *is* its
/// identity, so a missing one shows a muted tile rather than a generated
/// color, exactly like `CoursesEmptyCard`'s own muted placeholder below.
export function RecipesListView({ spaceId }: { spaceId: string }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const [createOpen, setCreateOpen] = useState(false);
  useCreateShortcut(() => setCreateOpen(true));

  const { data: recipes = [] } = useQuery({
    queryKey: qk.recipes.bySpace(spaceId),
    queryFn: () => listRecipes(spaceId),
  });
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const usedTags = [
    ...new Map(recipes.flatMap((r) => r.tags.map((t) => [t.id, t] as const))).values(),
  ].sort((a, b) => a.position - b.position);
  const filterFields: FilterField[] = [
    {
      id: "kind",
      label: "Kind",
      icon: IconToolsKitchen2,
      options: RECIPE_KINDS.map((k) => ({ value: k, label: RECIPE_KIND_LABELS[k] })),
    },
    {
      id: "tags",
      label: "Tags",
      icon: IconTag,
      options: usedTags.map((t) => ({ value: t.id, label: t.name })),
    },
    {
      id: "time",
      label: "Time",
      icon: IconClock,
      options: RECIPE_TIME_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
    },
    ...ENTITY_FILTER_FIELDS,
  ];
  const shown = applyFilters(
    recipes,
    filters,
    (recipe, fieldId) =>
      entityFilterValue(recipe.entity, fieldId) ??
      (fieldId === "kind"
        ? recipe.kind
        : fieldId === "tags"
          ? recipe.tags.map((t) => t.id)
          : recipeTime(recipe.totalDurationMinutes)),
  );

  return (
    <div
      className="flex flex-col gap-3"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Recipe",
        create: () => setCreateOpen(true),
      })}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold">Recipes</h1>
        <div className="flex flex-wrap items-center gap-2">
          {recipes.length > 0 && (
            <FilterMenu fields={filterFields} filters={filters} onFiltersChange={setFilters} />
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <IconPlus size={14} /> New recipe
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @3xl:grid-cols-3">
        {recipes.length === 0 ? (
          <>
            <RecipesEmptyCard onCreate={() => setCreateOpen(true)} />
            {PLACEHOLDER_WIDTHS.map((width, i) => (
              <RecipePlaceholderCard key={i} titleWidth={width} />
            ))}
          </>
        ) : shown.length === 0 ? (
          <div className="col-span-full">
            <NoMatchesNotice
              text="No recipes match these filters."
              onClear={() => setFilters([])}
            />
          </div>
        ) : (
          shown.map((recipe) => (
            <RecipeCard
              key={recipe.entity.id}
              recipe={recipe}
              onOpen={() => openEntity(recipe.entity.id, spaceId)}
            />
          ))
        )}
      </div>

      <CreateRecipeDialog open={createOpen} onOpenChange={setCreateOpen} spaceId={spaceId} />
    </div>
  );
}

function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  const { entity } = recipe;
  const duration = recipe.totalDurationMinutes;
  return (
    <GalleryCard className="group" onClick={onOpen} {...entityTarget(entity)}>
      <GalleryCardImageBanner
        src={recipe.bannerPath ? convertFileSrc(recipe.bannerPath) : null}
        icon={<IconToolsKitchen2 size={20} />}
        fade={false}
        className="h-32"
      />
      <GalleryCardBody>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium group-hover:underline">
            {displayTitle(entity)}
          </span>
          <EntityKey entityKey={entity.key} className="ml-auto" />
        </span>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border bg-muted px-2 py-0.5 capitalize">
            {RECIPE_KIND_LABELS[recipe.kind]}
          </span>
          {duration != null && (
            <span className="flex items-center gap-1">
              <IconClock size={11} />
              {duration} min
            </span>
          )}
        </div>
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.tags.map((tag) => (
              <RecipeTagChip key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </GalleryCardBody>
    </GalleryCard>
  );
}

const PLACEHOLDER_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-1/2", "w-3/5"];

/// Ghost cards fill out the empty-state grid (same convention as
/// `CoursePlaceholderCard`) — inert and faded, not a loading skeleton.
function RecipesEmptyCard({ onCreate }: { onCreate: () => void }) {
  return (
    <GalleryCard variant="dashed">
      <GalleryCardImageBanner
        icon={<IconToolsKitchen2 size={20} className="text-muted-foreground/50" />}
        fade={false}
        className="h-32"
      />
      <GalleryCardBody className="items-center text-center">
        <p className="text-sm font-medium text-foreground">No recipes yet</p>
        <p className="text-xs text-muted-foreground">
          Add a recipe to start tracking its ingredients and steps.
        </p>
        <Button size="sm" className="mt-1 gap-1.5" onClick={onCreate}>
          <IconPlus size={14} /> New recipe
        </Button>
      </GalleryCardBody>
    </GalleryCard>
  );
}

function RecipePlaceholderCard({ titleWidth }: { titleWidth: string }) {
  return (
    <GalleryCard aria-hidden ghost>
      <GalleryCardImageBanner />
      <GalleryCardBody>
        <div className="flex items-center gap-2">
          <div className="size-4 shrink-0 rounded-sm bg-muted-foreground/30" />
          <div className={`h-3.5 ${titleWidth} rounded bg-muted-foreground/30`} />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-16 rounded-sm bg-muted-foreground/20" />
          <div className="h-3 w-10 rounded bg-muted-foreground/20" />
        </div>
      </GalleryCardBody>
    </GalleryCard>
  );
}

function CreateRecipeDialog({
  open,
  onOpenChange,
  spaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}) {
  return (
    <CreateNameDialog
      open={open}
      onOpenChange={onOpenChange}
      spaceId={spaceId}
      heading="New recipe"
      fieldId="recipe-name"
      placeholder="e.g. Tomato soup"
      emptyMessage="Give the recipe a name"
      create={createRecipe}
      listKey={qk.recipes.bySpace(spaceId)}
      entitiesKey={qk.entities.bySpace(spaceId)}
    />
  );
}
