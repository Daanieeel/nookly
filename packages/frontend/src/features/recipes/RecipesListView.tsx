import { qk } from "#/lib/query-keys.ts";
import { FormField, fieldMessage } from "#/components/form-field.tsx";
import { IconClock, IconPlus, IconToolsKitchen2 } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useForm } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { contextTarget, entityTarget } from "#/components/context-menu/registry.ts";
import { EntityKey } from "#/components/entity-key.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import {
  GalleryCard,
  GalleryCardBody,
  GalleryCardImageBanner,
} from "@nookly/ui/components/gallery-card";
import { Input } from "@nookly/ui/components/input";
import { createRecipe, listRecipes } from "#/lib/api/recipes.ts";
import type { Recipe } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { RECIPE_KIND_LABELS } from "./recipe-kind.ts";
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

  return (
    <div
      className="flex flex-col gap-3"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Recipe",
        create: () => setCreateOpen(true),
      })}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Recipes</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <IconPlus size={14} /> New recipe
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.length === 0 ? (
          <>
            <RecipesEmptyCard onCreate={() => setCreateOpen(true)} />
            {PLACEHOLDER_WIDTHS.map((width, i) => (
              <RecipePlaceholderCard key={i} titleWidth={width} />
            ))}
          </>
        ) : (
          recipes.map((recipe) => (
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
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 capitalize">
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
          <div className="size-4 shrink-0 rounded-full bg-muted-foreground/30" />
          <div className={`h-3.5 ${titleWidth} rounded bg-muted-foreground/30`} />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-16 rounded-full bg-muted-foreground/20" />
          <div className="h-3 w-10 rounded bg-muted-foreground/20" />
        </div>
      </GalleryCardBody>
    </GalleryCard>
  );
}

const createRecipeSchema = z.object({ title: z.string().trim().min(1, "Give the recipe a name") });

function CreateRecipeDialog({
  open,
  onOpenChange,
  spaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm({
    defaultValues: { title: "" },
    validators: { onChange: createRecipeSchema },
    onSubmit: ({ value }) => {
      if (!create.isPending && !create.isSuccess) create.mutate(value.title);
    },
  });

  const create = useMutation({
    mutationFn: (title: string) => createRecipe(spaceId, title.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.recipes.bySpace(spaceId) });
      queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(spaceId) });
    },
  });
  const { reset } = create;
  useCloseAfterSuccess(create, () => {
    onOpenChange(false);
    if (create.data) openEntity(create.data.id, spaceId);
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      form.reset();
      reset();
    }
  }, [open, reset, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New recipe</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="title">
            {(field) => (
              <FormField label="Name" htmlFor="recipe-name" error={fieldMessage(field)}>
                <Input
                  id="recipe-name"
                  ref={inputRef}
                  placeholder="e.g. Tomato soup"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </FormField>
            )}
          </form.Field>
        </form>
        <DialogFooter>
          <Button onClick={() => void form.handleSubmit()}>
            <StatusButtonContent
              status={statusOf(create)}
              label="Create"
              successLabel="Created"
              errorLabel="Couldn't create, try again"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
