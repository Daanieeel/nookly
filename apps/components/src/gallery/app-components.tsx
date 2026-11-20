"use client";

import { IconInbox, IconListCheck, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import {
  type ActionStatus,
  FieldError,
  StatusButtonContent,
} from "@nookly/frontend/components/action-feedback";
import { ConfirmPermanentDialog } from "@nookly/frontend/components/confirm-permanent-dialog";
import { EmptyState } from "@nookly/frontend/components/empty-state";
import { EntityIcon } from "@nookly/frontend/components/entity-icon";
import { FLOATING_BAR_INPUT, FloatingBar } from "@nookly/frontend/components/floating-bar";
import { Kbd, KbdGroup } from "@nookly/frontend/components/kbd";
import { LabelChip } from "@nookly/frontend/components/label-chip";
import { MascotFigure } from "@nookly/frontend/components/mascot-figure";
import { MiddleEllipsis } from "@nookly/frontend/components/middle-ellipsis";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderTitle,
} from "@nookly/frontend/components/page-header";
import { PropertyRow } from "@nookly/frontend/components/property-row";
import { SpaceChip } from "@nookly/frontend/components/space-chip";
import type { Label, Space } from "@nookly/frontend/lib/api/types";
import type { GalleryEntry } from "./types";

const SPACE: Space = {
  id: "space-1",
  name: "Spring term",
  icon: null,
  color: "#6366f1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  position: 0,
};

const LABELS: Label[] = [
  { id: "l1", spaceId: "space-1", name: "Exam", color: "#ef4444", createdAt: "", usageCount: 3 },
  { id: "l2", spaceId: "space-1", name: "Reading", color: "#22c55e", createdAt: "", usageCount: 8 },
  {
    id: "l3",
    spaceId: "space-1",
    name: "Group work",
    color: "#f59e0b",
    createdAt: "",
    usageCount: 1,
  },
];

function StatusButtonDemo() {
  const [status, setStatus] = useState<ActionStatus>("idle");
  const run = (next: "success" | "error") => {
    setStatus("pending");
    setTimeout(() => {
      setStatus(next);
      setTimeout(() => setStatus("idle"), 1500);
    }, 800);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run("success")} disabled={status !== "idle"}>
          <StatusButtonContent
            status={status}
            icon={<IconPlus />}
            label="Create"
            successLabel="Created"
            errorLabel="Failed"
          />
        </Button>
        <Button variant="secondary" onClick={() => run("error")} disabled={status !== "idle"}>
          Make it fail
        </Button>
      </div>
      <FieldError message={status === "error" ? "Could not save. Try again." : null} />
    </div>
  );
}

function ConfirmDemo() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ActionStatus>("idle");
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete space…
      </Button>
      <ConfirmPermanentDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Spring term forever?"
        description="Its notes, tasks and files are removed. This cannot be undone."
        stats={[
          { value: 24, label: "notes" },
          { value: 12, label: "tasks" },
        ]}
        phrase="Spring term"
        actionLabel="Delete forever"
        successLabel="Deleted"
        errorLabel="Could not delete"
        status={status}
        onConfirm={() => {
          setStatus("pending");
          setTimeout(() => {
            setStatus("success");
            setTimeout(() => {
              setOpen(false);
              setStatus("idle");
            }, 600);
          }, 600);
        }}
      />
    </>
  );
}

const source = (file: string) => `packages/frontend/src/components/${file}`;

export const APP_COMPONENTS: GalleryEntry[] = [
  {
    id: "empty-state",
    name: "EmptyState",
    group: "App components",
    source: source("empty-state.tsx"),
    render: () => (
      <div className="grid w-full gap-4 md:grid-cols-2">
        <EmptyState
          icon={IconListCheck}
          title="No tasks yet"
          description="Tasks you add show up here."
          action={{ label: "New task", onClick: () => {} }}
        />
        <EmptyState compact icon={IconInbox} title="Inbox is empty" />
      </div>
    ),
  },
  {
    id: "page-header",
    name: "PageHeader",
    group: "App components",
    source: source("page-header.tsx"),
    render: () => (
      <div className="w-full">
        <PageHeader>
          <PageHeaderTitle icon={IconListCheck}>Tasks</PageHeaderTitle>
          <PageHeaderActions>
            <Button size="sm">
              <IconPlus /> New task
            </Button>
          </PageHeaderActions>
        </PageHeader>
      </div>
    ),
  },
  {
    id: "property-row",
    name: "PropertyRow",
    group: "App components",
    source: source("property-row.tsx"),
    render: () => (
      <div className="flex w-full max-w-sm flex-col">
        <PropertyRow label="Status">In progress</PropertyRow>
        <PropertyRow label="Due">Friday</PropertyRow>
        <PropertyRow label="Space">
          <SpaceChip space={SPACE} />
        </PropertyRow>
      </div>
    ),
  },
  {
    id: "chips",
    name: "SpaceChip and LabelChip",
    group: "App components",
    source: source("label-chip.tsx"),
    render: () => (
      <div className="flex flex-wrap items-center gap-2">
        <SpaceChip space={SPACE} />
        {LABELS.map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
      </div>
    ),
  },
  {
    id: "entity-icon",
    name: "EntityIcon",
    group: "App components",
    source: source("entity-icon.tsx"),
    render: () => (
      <div className="flex flex-wrap items-center gap-4">
        {["task", "note", "file", "bookmark", "page"].map((type) => (
          <div key={type} className="flex items-center gap-1.5 text-sm">
            <EntityIcon entity={{ type, icon: null }} /> {type}
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "middle-ellipsis",
    name: "MiddleEllipsis",
    group: "App components",
    source: source("middle-ellipsis.tsx"),
    note: "Shortens the middle of a long name and keeps its start and its extension.",
    render: () => (
      <div className="w-56 text-sm">
        <MiddleEllipsis text="Lecture notes week 12 final revision with annotations.pdf" />
      </div>
    ),
  },
  {
    id: "platform-kbd",
    name: "Kbd (platform aware)",
    group: "App components",
    source: source("kbd.tsx"),
    note: "Written with Mac symbols; other systems read Ctrl, Alt and Shift.",
    render: () => (
      <KbdGroup>
        <Kbd>⇧⌘K</Kbd>
        <Kbd>⌘,</Kbd>
      </KbdGroup>
    ),
  },
  {
    id: "floating-bar",
    name: "FloatingBar",
    group: "App components",
    source: source("floating-bar.tsx"),
    render: () => (
      <div className="relative h-24 w-full overflow-hidden rounded-lg border bg-background">
        <FloatingBar onSubmit={() => {}}>
          <input
            aria-label="Add a bookmark"
            placeholder="Paste a link"
            className={FLOATING_BAR_INPUT}
          />
          <Button size="sm" type="submit">
            Add
          </Button>
        </FloatingBar>
      </div>
    ),
  },
  {
    id: "action-feedback",
    name: "StatusButtonContent and FieldError",
    group: "App components",
    source: source("action-feedback.tsx"),
    render: () => <StatusButtonDemo />,
  },
  {
    id: "confirm-permanent-dialog",
    name: "ConfirmPermanentDialog",
    group: "App components",
    source: source("confirm-permanent-dialog.tsx"),
    note: "Every permanent action in the app goes through this one.",
    render: () => <ConfirmDemo />,
  },
  {
    id: "mascot-figure",
    name: "MascotFigure",
    group: "App components",
    source: source("mascot-figure.tsx"),
    render: () => <MascotFigure size={72} />,
  },
  {
    id: "form-input",
    name: "Input in a form row",
    group: "App components",
    source: "apps/components/src/gallery/app-components.tsx",
    render: () => <Input aria-label="Space name" defaultValue="Spring term" className="max-w-xs" />,
  },
];
