/// The ingredient and step lists of a recipe page, edited in place.
import { qk } from "#/lib/query-keys.ts";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconClock, IconClockPlus, IconGripVertical, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { NumberInput } from "@nookly/ui/components/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import {
  createIngredient,
  createStep,
  deleteIngredient,
  deleteStep,
  listIngredients,
  moveIngredient,
  listSteps,
  moveStep,
  updateIngredient,
  updateStep,
} from "#/lib/api/recipes.ts";
import type { RecipeStep } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";

/// A pasted list ("- 2 cups flour\n- 1 egg", "1. flour\n2. egg") becomes one
/// ingredient per line: leading bullets, dashes and numbers are stripped.
export type DurationUnit = "min" | "h";

export function toUnit(minutes: number, unit: DurationUnit): number {
  return unit === "h" ? Math.round((minutes / 60) * 10) / 10 : minutes;
}

const LIST_MARKER = /^\s*(?:[•‣◦▪·]\s*|[-*–—]\s+|\d+[.)]\s+)/;
function splitPastedList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(LIST_MARKER, "").trim())
    .filter(Boolean);
}

/// Two columns of bullet points, each backed by its own ingredient record. A
/// trailing blank input is always present; typing into it and blurring (or
/// Enter) creates the next ingredient and slides in a fresh blank one, so the
/// list never needs a separate "Add" button (§05 content-aware creation).
/// Pasting a multi-line list adds every line at once, and rows drag to reorder
/// (the order reads across the columns, then down).
export function IngredientsSection({ recipeId }: { recipeId: string }) {
  const queryClient = useQueryClient();
  const { data: ingredients = [] } = useQuery({
    queryKey: qk.recipes.ingredients(recipeId),
    queryFn: () => listIngredients(recipeId),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: qk.recipes.ingredients(recipeId) });

  const add = useMutation({
    mutationFn: (text: string) => createIngredient(recipeId, text),
    onSuccess: invalidate,
  });
  const addMany = useMutation({
    // One at a time, so they land in the order they were pasted.
    mutationFn: async (lines: string[]) => {
      for (const line of lines) await createIngredient(recipeId, line);
    },
    onSettled: invalidate,
  });
  const edit = useMutation({
    mutationFn: (vars: { id: string; text: string }) => updateIngredient(vars.id, vars.text),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteIngredient(id),
    onSuccess: invalidate,
  });
  const move = useMutation({
    mutationFn: (vars: { id: string; position: number }) => moveIngredient(vars.id, vars.position),
    onSettled: invalidate,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ingredients.findIndex((i) => i.id === active.id);
    const to = ingredients.findIndex((i) => i.id === over.id);
    if (from === -1 || to === -1) return;
    // Optimistic: show the new order now, the backend confirms behind it.
    queryClient.setQueryData(qk.recipes.ingredients(recipeId), arrayMove(ingredients, from, to));
    move.mutate({ id: ingredients[from]?.id ?? "", position: to });
  };

  // Enter on the blank row should land the cursor on the next blank row, which
  // is a fresh instance once the new ingredient arrives; blur must not steal focus.
  const refocusNew = useRef(false);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Ingredients</h2>
      <div className="grid grid-cols-1 gap-x-4 @sm:grid-cols-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ingredients.map((i) => i.id)} strategy={rectSortingStrategy}>
            {ingredients.map((ingredient) => (
              <BulletRow
                key={ingredient.id}
                id={ingredient.id}
                value={ingredient.text}
                onCommit={(text) => {
                  if (text.trim() === "") remove.mutate(ingredient.id);
                  else if (text !== ingredient.text) edit.mutate({ id: ingredient.id, text });
                }}
                onRemove={() => remove.mutate(ingredient.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
        <NewBulletRow
          key={ingredients.length}
          focusOnMount={refocusNew.current}
          onCommit={(text, viaEnter) => {
            refocusNew.current = viaEnter;
            add.mutate(text.trim());
          }}
          onPasteList={(lines) => {
            refocusNew.current = true;
            addMany.mutate(lines);
          }}
        />
      </div>
    </div>
  );
}

function BulletRow({
  id,
  value,
  onCommit,
  onRemove,
}: {
  id: string;
  value: string;
  onCommit: (text: string) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/row flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-accent/40 focus-within:bg-accent/40",
        isDragging && "relative z-10 bg-card shadow-md",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder ingredient"
            className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-accent active:cursor-grabbing"
          >
            <IconGripVertical size={12} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Drag to Reorder</TooltipContent>
      </Tooltip>
      <span className="text-muted-foreground">•</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove ingredient"
            className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
          >
            <IconX size={12} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Remove Ingredient</TooltipContent>
      </Tooltip>
    </div>
  );
}

/// The always-present blank row at the end of the list: typing and
/// committing hands the text up to the parent (which creates the record),
/// then this row itself resets to blank via its `key` bump in the parent.
function NewBulletRow({
  focusOnMount,
  onCommit,
  onPasteList,
}: {
  focusOnMount: boolean;
  onCommit: (text: string, viaEnter: boolean) => void;
  onPasteList: (lines: string[]) => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  const commit = (viaEnter: boolean) => {
    if (!text.trim()) return;
    onCommit(text, viaEnter);
    setText("");
  };

  return (
    <div className="group/row flex items-center gap-1.5 rounded-md px-1 py-0.5 focus-within:bg-accent/40">
      <span className="size-5 shrink-0" />
      <span className="text-muted-foreground">•</span>
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(true);
          }
        }}
        onPaste={(e) => {
          const lines = splitPastedList(e.clipboardData.getData("text"));
          if (lines.length < 2) return;
          e.preventDefault();
          onPasteList(lines);
        }}
        placeholder="Add an ingredient"
        className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      <span className="size-5 shrink-0" />
    </div>
  );
}

/// "15 min", "1 h", "1 h 30 min".
function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/// A textarea that grows with its content, so a long step never scrolls or
/// clips inside a one-line box.
function AutoTextarea({
  value,
  className,
  textareaRef,
  ...props
}: Omit<React.ComponentProps<"textarea">, "ref"> & {
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      {...props}
      value={value}
      rows={1}
      ref={(el) => {
        inner.current = el;
        if (textareaRef) textareaRef.current = el;
      }}
      className={cn(
        "min-w-0 flex-1 resize-none overflow-hidden bg-transparent outline-none",
        className,
      )}
    />
  );
}

/// Optional time for a step. Empty, it's a quiet "Add time" that only shows on
/// row hover or focus; set, it's a small clock chip that's always visible.
/// Either opens a popover to step the minutes or clear them. Landing on 0
/// clears it.
function StepDuration({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (minutes: number | null) => void;
}) {
  const [unit, setUnit] = useState<DurationUnit>(
    value != null && value >= 60 && value % 60 === 0 ? "h" : "min",
  );
  const change = (next: number) => {
    const minutes = Math.round(unit === "h" ? next * 60 : next);
    onChange(minutes === 0 ? null : minutes);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        {value != null ? (
          <button
            type="button"
            className="flex h-6 items-center gap-1 rounded-md border border-input bg-accent px-2 text-xs text-muted-foreground tabular-nums hover:bg-accent/80 hover:text-foreground"
          >
            <IconClock size={12} />
            {formatMinutes(value)}
          </button>
        ) : (
          <button
            type="button"
            className="flex h-6 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <IconClockPlus size={12} />
            Add time
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Duration</span>
          <div className="flex items-center gap-1.5">
            <NumberInput
              value={toUnit(value ?? 0, unit)}
              onChange={change}
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
          {value != null && (
            <Button variant="secondary" size="sm" className="h-7" onClick={() => onChange(null)}>
              Clear time
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/// Same appear-a-new-blank-row mechanic as ingredients, numbered instead of
/// bulleted. Time is optional per step; when the recipe has no manual duration
/// the steps' times add up to its total, shown in the header.
export function StepsSection({ recipeId }: { recipeId: string }) {
  const queryClient = useQueryClient();
  const { data: steps = [] } = useQuery({
    queryKey: qk.recipes.steps(recipeId),
    queryFn: () => listSteps(recipeId),
  });
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: qk.recipes.steps(recipeId) });
    queryClient.invalidateQueries({ queryKey: qk.recipes.byId(recipeId) });
    queryClient.invalidateQueries({ queryKey: qk.recipes.root });
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
  const move = useMutation({
    mutationFn: (vars: { id: string; position: number }) => moveStep(vars.id, vars.position),
    onSettled: invalidateAll,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = steps.findIndex((s) => s.id === active.id);
    const to = steps.findIndex((s) => s.id === over.id);
    if (from === -1 || to === -1) return;
    // Optimistic: show the new order now, the backend confirms behind it.
    queryClient.setQueryData(qk.recipes.steps(recipeId), arrayMove(steps, from, to));
    move.mutate({ id: steps[from]?.id ?? "", position: to });
  };

  // Enter on the blank row should land the cursor on the next blank row, which
  // is a fresh instance once the new step arrives; blur must not steal focus.
  const refocusNew = useRef(false);
  const total = steps.reduce((sum, step) => sum + (step.durationMinutes ?? 0), 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Steps</h2>
        {total > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <IconClock size={12} />
            {formatMinutes(total)} total
          </span>
        )}
      </div>
      <div className="flex flex-col">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
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
          </SortableContext>
        </DndContext>
        <NewStepRow
          key={steps.length}
          index={steps.length + 1}
          focusOnMount={refocusNew.current}
          onCommit={(text, duration, viaEnter) => {
            refocusNew.current = viaEnter;
            add.mutate({ text: text.trim(), duration });
          }}
        />
      </div>
    </div>
  );
}

function RemoveStepButton({ onRemove }: { onRemove: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove step"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
        >
          <IconX size={14} />
        </button>
      </TooltipTrigger>
      <TooltipContent>Remove Step</TooltipContent>
    </Tooltip>
  );
}

function StepNumber({ index, muted = false }: { index: number; muted?: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
        muted ? "bg-muted/50 text-muted-foreground/60" : "bg-muted text-muted-foreground",
      )}
    >
      {index}
    </span>
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
  useEffect(() => setText(step.text), [step.text]);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/row flex items-start gap-2 rounded-md p-2 hover:bg-accent/40 focus-within:bg-accent/40",
        isDragging && "relative z-10 bg-card shadow-md",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder step"
            className="mt-0.5 flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-accent active:cursor-grabbing"
          >
            <IconGripVertical size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Drag to Reorder</TooltipContent>
      </Tooltip>
      <StepNumber index={index} />
      <AutoTextarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text, step.durationMinutes)}
        className="py-0.5 text-sm"
      />
      <div className="flex shrink-0 items-center gap-1">
        <RemoveStepButton onRemove={onRemove} />
        <StepDuration value={step.durationMinutes} onChange={(m) => onCommit(text, m)} />
      </div>
    </div>
  );
}

function NewStepRow({
  index,
  focusOnMount,
  onCommit,
}: {
  index: number;
  focusOnMount: boolean;
  onCommit: (text: string, duration: number | null, viaEnter: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  const commit = (viaEnter: boolean) => {
    if (!text.trim()) return;
    onCommit(text, duration, viaEnter);
    setText("");
    setDuration(null);
  };

  return (
    <div className="group/row flex items-start gap-2 rounded-md p-2 focus-within:bg-accent/40">
      <span className="size-6 shrink-0" />
      <StepNumber index={index} muted />
      <AutoTextarea
        textareaRef={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit(true);
          }
        }}
        placeholder="Add a step"
        className="py-0.5 text-sm placeholder:text-muted-foreground"
      />
      <div className="flex shrink-0 items-center gap-1">
        <span className="size-6 shrink-0" />
        <StepDuration value={duration} onChange={setDuration} />
      </div>
    </div>
  );
}
