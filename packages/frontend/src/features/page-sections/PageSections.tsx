import { IconAdjustmentsHorizontal, IconArrowRight, IconChevronRight } from "@tabler/icons-react";
import { type Icon as TablerIcon } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { SortableToggleList } from "#/components/sortable-toggle-list.tsx";
import { optionKey } from "#/features/relationships/RelatePickerPopover.tsx";
import {
  pickableRelationshipTypes,
  SectionAdd,
} from "#/features/relationships/RelationshipsPanel.tsx";
import {
  DEFAULT_ENTITY_VIEW,
  EntityView,
  type EntityViewConfig,
} from "#/features/views/engine/EntityView.tsx";
import type { ViewSourceType } from "#/features/views/engine/sources.ts";
import { DEFAULT_TABLE } from "#/features/views/engine/table-display.ts";
import type { TableDisplay, ViewScope } from "#/features/views/engine/types.ts";
import { listRelationshipTypes } from "#/lib/api/relationships.ts";
import type { Entity } from "#/lib/api/types.ts";
import { labelForType } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { type SectionPref, useSectionPrefs } from "./section-prefs.ts";

/// The related items of a structured page (a Course first) as sections of its body, one per
/// related type, each a view from the view engine scoped to the page. The module sets which
/// sections there are and their order; the user hides, reorders and folds them per page
/// type. Sections are views underneath, so a view the user makes can take a section's
/// place later without changing how a page lays them out.

/// The page types whose related items show as sections, so the right sidebar lists their
/// links only on request.
export const PAGE_SECTION_TYPES = new Set(["course"]);

interface SectionBase {
  id: string;
  title: string;
  icon: TablerIcon;
  /// What the "+" links or creates: the related type and the relationship it uses, read
  /// from the page's side (`reverse` when the related item points at the page).
  add?: { targetType: string; relationship: string; reverse: boolean };
  /// Opens the type's own page filtered to this one.
  onViewAll?: () => void;
}

/// A section that is a view of a registered type, scoped to the page.
interface ViewSection extends SectionBase {
  source: ViewSourceType;
  scope: ViewScope;
  /// The table the section starts with, until the user sorts or picks columns.
  table?: TableDisplay;
}

/// A section the module draws itself, like a Course's week of Sessions.
interface CustomSection extends SectionBase {
  body: ReactNode;
}

export type PageSectionDef = ViewSection | CustomSection;

export function PageSections({
  entity,
  defaultIds,
  sections,
}: {
  entity: Entity;
  /// Every section's id in the module's order. Kept stable, as the preferences read it.
  defaultIds: readonly string[];
  sections: PageSectionDef[];
}) {
  const { prefs, save, update } = useSectionPrefs(entity.type, defaultIds);
  const byId = new Map(sections.map((s) => [s.id, s]));
  const known = prefs.filter((p) => byId.has(p.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="-mb-4 flex justify-end">
        <CustomizeSections
          prefs={known}
          onChange={save}
          describe={(p) => byId.get(p.id) ?? { title: p.id, icon: IconChevronRight }}
        />
      </div>
      {known
        .filter((p) => !p.hidden)
        .map((pref) => {
          const section = byId.get(pref.id);
          return (
            section && (
              <PageSection
                key={pref.id}
                entity={entity}
                section={section}
                pref={pref}
                onChange={(patch) => update(pref.id, patch)}
              />
            )
          );
        })}
    </div>
  );
}

function CustomizeSections({
  prefs,
  onChange,
  describe,
}: {
  prefs: SectionPref[];
  onChange: (prefs: SectionPref[]) => void;
  describe: (pref: SectionPref) => { title: string; icon: TablerIcon };
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Customize sections">
              <IconAdjustmentsHorizontal />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Customize sections</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-56 p-1.5" aria-label="Customize sections">
        <SortableToggleList
          items={prefs}
          onChange={onChange}
          describe={(pref) => {
            const { title, icon } = describe(pref);
            return { label: title, icon };
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function PageSection({
  entity,
  section,
  pref,
  onChange,
}: {
  entity: Entity;
  section: PageSectionDef;
  pref: SectionPref;
  onChange: (patch: Partial<Omit<SectionPref, "id">>) => void;
}) {
  const shell = (count: number | null, body: ReactNode) => (
    <SectionShell
      entity={entity}
      section={section}
      count={count}
      collapsed={pref.collapsed}
      onToggle={() => onChange({ collapsed: !pref.collapsed })}
    >
      {body}
    </SectionShell>
  );
  if ("body" in section) return shell(null, section.body);
  const config: EntityViewConfig = {
    ...DEFAULT_ENTITY_VIEW,
    display: { layout: "table", table: pref.table ?? section.table ?? DEFAULT_TABLE },
  };
  return (
    <EntityView
      source={section.source}
      spaceId={entity.spaceId}
      anchorId={entity.id}
      scope={section.scope}
      includeOtherSpaces
      config={config}
      onConfigChange={(next) => onChange({ table: next.display.table })}
      // Loads while folded too, so the header can still say how many there are.
      frame={({ count, body }) => shell(count, body)}
    />
  );
}

function SectionShell({
  entity,
  section,
  count,
  collapsed,
  onToggle,
  children,
}: {
  entity: Entity;
  section: PageSectionDef;
  count: number | null;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  const { title, icon: Icon, add, onViewAll } = section;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1.5">
      <div className="flex h-7 items-center gap-1.5">
        <h2 id={headingId} className="text-sm font-semibold">
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={onToggle}
            className="flex cursor-pointer items-center gap-1.5 rounded-md py-0.5 pr-1.5 pl-0.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <IconChevronRight
              size={14}
              aria-hidden
              className={cn(
                "shrink-0 text-muted-foreground transition-transform",
                !collapsed && "rotate-90",
              )}
            />
            <Icon size={15} aria-hidden className="shrink-0 text-muted-foreground" />
            {title}
          </button>
        </h2>
        {count !== null && count > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
        )}
        {add && <AddToSection entity={entity} add={add} />}
        {onViewAll && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1 text-xs"
            onClick={onViewAll}
          >
            View all <IconArrowRight size={12} />
          </Button>
        )}
      </div>
      {!collapsed && children}
    </section>
  );
}

function AddToSection({ entity, add }: { entity: Entity; add: NonNullable<SectionBase["add"]> }) {
  const { data: types = [] } = useQuery({
    queryKey: qk.relationships.types,
    queryFn: listRelationshipTypes,
  });
  return (
    <SectionAdd
      entity={entity}
      types={pickableRelationshipTypes(types, entity)}
      label={labelForType(add.targetType)}
      start={{ targetType: add.targetType, optionKey: optionKey(add.relationship, add.reverse) }}
    />
  );
}
