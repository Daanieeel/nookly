import { useState } from "react";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import type { Entity } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { BlockEditor } from "./BlockEditor";
import type { PageSection } from "./heading-anchors";

/// A page needs at least this many headings before a section navigator helps.
const MIN_SECTIONS = 2;

/// Shared body for Notes and Jots (§5.2/§5.3) — both are just
/// pages of blocks under a different entity type. The page IS the canvas (§2.3):
/// no sidebar-list-plus-detail-pane split, just full-width document flow.
/// A page with headings gets a floating section navigator over its body.
export function PageDetailView({ entity }: { entity: Entity }) {
  const [sections, setSections] = useState<PageSection[]>([]);
  const showSections = sections.length >= MIN_SECTIONS;
  return (
    <EntityDetailLayout
      entity={entity}
      exportable
      bodyOverlay={(scrollContainer) =>
        showSections && (
          <ScrollProgress
            sections={sections}
            containerRef={scrollContainer}
            className="absolute bottom-4"
          />
        )
      }
    >
      {/* Room below the last line, so it can scroll clear of the navigator. */}
      <div className={cn("mx-auto flex w-full max-w-3xl flex-col", showSections && "pb-16")}>
        <BlockEditor entityId={entity.id} spaceId={entity.spaceId} onSectionsChange={setSections} />
      </div>
    </EntityDetailLayout>
  );
}
