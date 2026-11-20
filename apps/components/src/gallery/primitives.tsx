"use client";

import {
  IconBell,
  IconChevronDown,
  IconCopy,
  IconFolder,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@nookly/ui/components/alert-dialog";
import { Badge } from "@nookly/ui/components/badge";
import { BrandButton } from "@nookly/ui/components/brand-button";
import { Button } from "@nookly/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nookly/ui/components/card";
import { CardPicker } from "@nookly/ui/components/card-picker";
import { Checkbox } from "@nookly/ui/components/checkbox";
import { CheckboxGroup } from "@nookly/ui/components/checkbox-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@nookly/ui/components/collapsible";
import { ComingSoon } from "@nookly/ui/components/coming-soon";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@nookly/ui/components/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@nookly/ui/components/context-menu";
import { CopyButton } from "@nookly/ui/components/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@nookly/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { FieldLabel } from "@nookly/ui/components/field-label";
import {
  GalleryCard,
  GalleryCardBanner,
  GalleryCardBody,
} from "@nookly/ui/components/gallery-card";
import { Input } from "@nookly/ui/components/input";
import { InteractiveCard } from "@nookly/ui/components/interactive-card";
import { Kbd, KbdGroup } from "@nookly/ui/components/kbd";
import { Label } from "@nookly/ui/components/label";
import { NumberInput } from "@nookly/ui/components/number-input";
import {
  PageTabs,
  PageTabsBar,
  PageTabsContent,
  PageTabsList,
  PageTabsTrigger,
} from "@nookly/ui/components/page-tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { ProgressCircle } from "@nookly/ui/components/progress-circle";
import { RadioGroup, RadioGroupItem } from "@nookly/ui/components/radio-group";
import { ScrollArea } from "@nookly/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { Separator } from "@nookly/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@nookly/ui/components/sheet";
import { Skeleton } from "@nookly/ui/components/skeleton";
import { Slider } from "@nookly/ui/components/slider";
import { showToast } from "@nookly/ui/components/sonner";
import { SplitButton } from "@nookly/ui/components/split-button";
import { Switch } from "@nookly/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nookly/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nookly/ui/components/tabs";
import { Textarea } from "@nookly/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { Tray } from "@nookly/ui/components/tray";
import type { GalleryEntry } from "./types";

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "muted",
  "link",
  "positive",
  "caution",
  "warning",
  "destructive",
] as const;

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="flex w-full flex-col gap-4">{children}</div>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function SwitchDemo() {
  const [on, setOn] = useState(true);
  return (
    <Row>
      <Switch id="demo-switch" checked={on} onCheckedChange={setOn} />
      <Label htmlFor="demo-switch">Notifications {on ? "on" : "off"}</Label>
    </Row>
  );
}

function CheckboxDemo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <Stack>
      <CheckboxGroup checked={a} onCheckedChange={(v) => setA(v === true)}>
        Remind me before it is due
      </CheckboxGroup>
      <CheckboxGroup checked={b} onCheckedChange={(v) => setB(v === true)} variant="destructive">
        Delete the files as well
      </CheckboxGroup>
      <CheckboxGroup checked disabled>
        Disabled
      </CheckboxGroup>
      <Row>
        <Checkbox aria-label="Bare checkbox" />
        <span className="text-xs text-muted-foreground">Bare Checkbox</span>
      </Row>
    </Stack>
  );
}

function RadioDemo() {
  return (
    <RadioGroup defaultValue="week" aria-label="Repeat">
      {["day", "week", "month"].map((v) => (
        <div key={v} className="flex items-center gap-2">
          <RadioGroupItem value={v} id={`repeat-${v}`} />
          <Label htmlFor={`repeat-${v}`}>Every {v}</Label>
        </div>
      ))}
    </RadioGroup>
  );
}

function SelectDemo() {
  return (
    <Select defaultValue="medium">
      <SelectTrigger className="w-48" aria-label="Priority">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="low">Low</SelectItem>
        <SelectItem value="medium">Medium</SelectItem>
        <SelectItem value="high">High</SelectItem>
      </SelectContent>
    </Select>
  );
}

function SliderDemo() {
  const [value, setValue] = useState([40]);
  return (
    <div className="w-full max-w-sm pb-6">
      <Slider
        aria-label="Effort"
        value={value}
        onValueChange={setValue}
        marks={[
          { value: 0, label: "None" },
          { value: 50, label: "Some" },
          { value: 100, label: "Lots" },
        ]}
      />
    </div>
  );
}

function NumberDemo() {
  const [value, setValue] = useState(3);
  return (
    <Row>
      <NumberInput aria-label="Count" value={value} onChange={setValue} min={0} max={10} />
      <NumberInput aria-label="Small count" value={value} onChange={setValue} size="sm" />
    </Row>
  );
}

function CardPickerDemo() {
  const [value, setValue] = useState<"list" | "board" | "calendar">("board");
  return (
    <div className="w-full">
      <CardPicker
        value={value}
        onChange={setValue}
        options={[
          { value: "list", label: "List", description: "Rows, one per task" },
          { value: "board", label: "Board", description: "Columns by status" },
          {
            value: "calendar",
            label: "Calendar",
            description: "By due date",
            disabled: true,
            disabledReason: "Needs a due date on at least one task",
          },
        ]}
      />
    </div>
  );
}

function CollapsibleDemo() {
  return (
    <Collapsible className="w-full max-w-sm">
      <CollapsibleTrigger asChild>
        <Button variant="secondary" size="sm">
          More options <IconChevronDown />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="pt-3 text-sm text-muted-foreground">Hidden until the trigger is pressed.</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CommandDemo() {
  return (
    <div className="w-full max-w-sm">
      <Command>
        <CommandInput placeholder="Search…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Go to">
            <CommandItem>
              <IconFolder /> Spaces
              <CommandShortcut>⌘1</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <IconSettings /> Settings
              <CommandShortcut>⌘,</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Create">
            <CommandItem>
              <IconPlus /> New task
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename space</DialogTitle>
          <DialogDescription>Pick a name you will recognise at a glance.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Name" defaultValue="Spring term" />
        <DialogFooter>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlertDialogDemo() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <IconTrash /> Delete…
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this note?</AlertDialogTitle>
          <AlertDialogDescription>It moves to the bin for 30 days.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SheetDemo() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Details</SheetTitle>
          <SheetDescription>A panel that slides in from the edge.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}

export const PRIMITIVES: GalleryEntry[] = [
  {
    id: "button",
    name: "Button",
    group: "Primitives",
    source: "packages/ui/src/components/button.tsx",
    render: () => (
      <Stack>
        <Row>
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </Row>
        <Row>
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" aria-label="New">
                <IconPlus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New</TooltipContent>
          </Tooltip>
          <Button disabled>Disabled</Button>
        </Row>
      </Stack>
    ),
  },
  {
    id: "brand-button",
    name: "BrandButton",
    group: "Primitives",
    source: "packages/ui/src/components/brand-button.tsx",
    render: () => <BrandButton>Get started</BrandButton>,
  },
  {
    id: "split-button",
    name: "SplitButton",
    group: "Primitives",
    source: "packages/ui/src/components/split-button.tsx",
    render: () => (
      <SplitButton>
        <Button>Save</Button>
        <Button size="icon" aria-label="More save options">
          <IconChevronDown />
        </Button>
      </SplitButton>
    ),
  },
  {
    id: "copy-button",
    name: "CopyButton",
    group: "Primitives",
    source: "packages/ui/src/components/copy-button.tsx",
    render: () => <CopyButton value="NOOK-42" />,
  },
  {
    id: "badge",
    name: "Badge",
    group: "Primitives",
    source: "packages/ui/src/components/badge.tsx",
    render: () => (
      <Stack>
        <Row>
          {(
            [
              "default",
              "secondary",
              "outline",
              "ghost",
              "positive",
              "warning",
              "destructive",
            ] as const
          ).map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </Row>
        <Row>
          {(["sm", "md", "lg"] as const).map((size) => (
            <Badge key={size} size={size}>
              {size}
            </Badge>
          ))}
        </Row>
      </Stack>
    ),
  },
  {
    id: "input",
    name: "Input",
    group: "Primitives",
    source: "packages/ui/src/components/input.tsx",
    render: () => (
      <Stack>
        <Input aria-label="Name" placeholder="Name" className="max-w-xs" />
        <Input aria-label="Disabled" disabled defaultValue="Disabled" className="max-w-xs" />
        <Input aria-label="Invalid" aria-invalid defaultValue="Invalid" className="max-w-xs" />
      </Stack>
    ),
  },
  {
    id: "textarea",
    name: "Textarea",
    group: "Primitives",
    source: "packages/ui/src/components/textarea.tsx",
    render: () => <Textarea aria-label="Notes" placeholder="Notes" className="max-w-sm" />,
  },
  {
    id: "label",
    name: "Label and FieldLabel",
    group: "Primitives",
    source: "packages/ui/src/components/label.tsx",
    render: () => (
      <Stack>
        <Label htmlFor="demo-label">Label</Label>
        <Input id="demo-label" className="max-w-xs" />
        <FieldLabel>FieldLabel</FieldLabel>
      </Stack>
    ),
  },
  {
    id: "number-input",
    name: "NumberInput",
    group: "Primitives",
    source: "packages/ui/src/components/number-input.tsx",
    render: () => <NumberDemo />,
  },
  {
    id: "select",
    name: "Select",
    group: "Primitives",
    source: "packages/ui/src/components/select.tsx",
    render: () => <SelectDemo />,
  },
  {
    id: "checkbox",
    name: "Checkbox and CheckboxGroup",
    group: "Primitives",
    source: "packages/ui/src/components/checkbox.tsx",
    render: () => <CheckboxDemo />,
  },
  {
    id: "radio-group",
    name: "RadioGroup",
    group: "Primitives",
    source: "packages/ui/src/components/radio-group.tsx",
    render: () => <RadioDemo />,
  },
  {
    id: "switch",
    name: "Switch",
    group: "Primitives",
    source: "packages/ui/src/components/switch.tsx",
    render: () => <SwitchDemo />,
  },
  {
    id: "slider",
    name: "Slider",
    group: "Primitives",
    source: "packages/ui/src/components/slider.tsx",
    render: () => <SliderDemo />,
  },
  {
    id: "card-picker",
    name: "CardPicker",
    group: "Primitives",
    source: "packages/ui/src/components/card-picker.tsx",
    render: () => <CardPickerDemo />,
  },
  {
    id: "card",
    name: "Card",
    group: "Primitives",
    source: "packages/ui/src/components/card.tsx",
    render: () => (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Spring term</CardTitle>
          <CardDescription>Six courses, twelve open tasks.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">Anything can go in the content.</CardContent>
      </Card>
    ),
  },
  {
    id: "interactive-card",
    name: "InteractiveCard",
    group: "Primitives",
    source: "packages/ui/src/components/interactive-card.tsx",
    render: () => (
      <InteractiveCard onClick={() => showToast("info", "Card pressed")} className="w-64 p-4">
        <div className="text-sm font-medium">Press me</div>
        <div className="text-xs text-muted-foreground">
          Button role, focus ring, Enter and Space.
        </div>
      </InteractiveCard>
    ),
  },
  {
    id: "gallery-card",
    name: "GalleryCard",
    group: "Primitives",
    source: "packages/ui/src/components/gallery-card.tsx",
    render: () => (
      <>
        <GalleryCard onClick={() => showToast("info", "Card pressed")} className="w-56">
          <GalleryCardBanner color="#6366f1" icon={<IconFolder className="size-8" />} />
          <GalleryCardBody>
            <div className="text-sm font-medium">Biology</div>
          </GalleryCardBody>
        </GalleryCard>
        <GalleryCard
          onClick={() => showToast("info", "New space")}
          variant="dashed"
          className="w-56"
        >
          <GalleryCardBody>
            <div className="text-sm text-muted-foreground">New space</div>
          </GalleryCardBody>
        </GalleryCard>
      </>
    ),
  },
  {
    id: "tray",
    name: "Tray",
    group: "Primitives",
    source: "packages/ui/src/components/tray.tsx",
    note: "A bezel for hero elements such as a search field or banner.",
    render: () => (
      <Tray className="w-full max-w-sm">
        <Input aria-label="Search" placeholder="Search" />
      </Tray>
    ),
  },
  {
    id: "separator",
    name: "Separator",
    group: "Primitives",
    source: "packages/ui/src/components/separator.tsx",
    render: () => (
      <div className="flex h-8 items-center gap-3 text-sm">
        Left <Separator orientation="vertical" /> Middle <Separator orientation="vertical" /> Right
      </div>
    ),
  },
  {
    id: "skeleton",
    name: "Skeleton",
    group: "Primitives",
    source: "packages/ui/src/components/skeleton.tsx",
    render: () => (
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </div>
    ),
  },
  {
    id: "progress-circle",
    name: "ProgressCircle",
    group: "Primitives",
    source: "packages/ui/src/components/progress-circle.tsx",
    render: () => (
      <Row>
        {[0, 25, 60, 100].map((value) => (
          <ProgressCircle key={value} value={value} size={28} />
        ))}
      </Row>
    ),
  },
  {
    id: "kbd",
    name: "Kbd",
    group: "Primitives",
    source: "packages/ui/src/components/kbd.tsx",
    render: () => (
      <Row>
        <Kbd>Esc</Kbd>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Row>
    ),
  },
  {
    id: "table",
    name: "Table",
    group: "Primitives",
    source: "packages/ui/src/components/table.tsx",
    render: () => (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[
            ["Read chapter 4", "Open", "Mon"],
            ["Lab report", "In progress", "Wed"],
            ["Essay draft", "Done", "Fri"],
          ].map(([task, status, due]) => (
            <TableRow key={task}>
              <TableCell>{task}</TableCell>
              <TableCell>{status}</TableCell>
              <TableCell className="text-right">{due}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ),
  },
  {
    id: "tabs",
    name: "Tabs",
    group: "Primitives",
    source: "packages/ui/src/components/tabs.tsx",
    render: () => (
      <Tabs defaultValue="one" className="w-full max-w-sm">
        <TabsList>
          <TabsTrigger value="one">Overview</TabsTrigger>
          <TabsTrigger value="two">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="one" className="text-sm">
          Overview content.
        </TabsContent>
        <TabsContent value="two" className="text-sm">
          Activity content.
        </TabsContent>
      </Tabs>
    ),
  },
  {
    id: "page-tabs",
    name: "PageTabs",
    group: "Primitives",
    source: "packages/ui/src/components/page-tabs.tsx",
    render: () => (
      <PageTabs defaultValue="notes" className="w-full">
        <PageTabsBar>
          <PageTabsList>
            <PageTabsTrigger value="notes">Notes</PageTabsTrigger>
            <PageTabsTrigger value="tasks">Tasks</PageTabsTrigger>
          </PageTabsList>
        </PageTabsBar>
        <PageTabsContent value="notes" className="p-3 text-sm">
          Notes tab.
        </PageTabsContent>
        <PageTabsContent value="tasks" className="p-3 text-sm">
          Tasks tab.
        </PageTabsContent>
      </PageTabs>
    ),
  },
  {
    id: "collapsible",
    name: "Collapsible",
    group: "Primitives",
    source: "packages/ui/src/components/collapsible.tsx",
    render: () => <CollapsibleDemo />,
  },
  {
    id: "scroll-area",
    name: "ScrollArea",
    group: "Primitives",
    source: "packages/ui/src/components/scroll-area.tsx",
    render: () => (
      <div className="w-64 rounded-md border">
        <ScrollArea className="h-32">
          <div className="flex flex-col gap-1 p-3 text-sm">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i}>Line {i + 1}</div>
            ))}
          </div>
        </ScrollArea>
      </div>
    ),
  },
  {
    id: "tooltip",
    name: "Tooltip",
    group: "Primitives",
    source: "packages/ui/src/components/tooltip.tsx",
    render: () => (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="secondary">Hover me</Button>
        </TooltipTrigger>
        <TooltipContent>A short explanation</TooltipContent>
      </Tooltip>
    ),
  },
  {
    id: "popover",
    name: "Popover",
    group: "Primitives",
    source: "packages/ui/src/components/popover.tsx",
    render: () => (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary">
            <IconBell /> Reminders
          </Button>
        </PopoverTrigger>
        <PopoverContent className="text-sm">Nothing due today.</PopoverContent>
      </Popover>
    ),
  },
  {
    id: "dropdown-menu",
    name: "DropdownMenu",
    group: "Primitives",
    source: "packages/ui/src/components/dropdown-menu.tsx",
    render: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary">
            Actions <IconChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Note</DropdownMenuLabel>
          <DropdownMenuItem>
            <IconCopy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            <IconTrash /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
  {
    id: "context-menu",
    name: "ContextMenu",
    group: "Primitives",
    source: "packages/ui/src/components/context-menu.tsx",
    render: () => (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex h-24 w-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Right click here
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>
            <IconCopy /> Duplicate
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive">
            <IconTrash /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ),
  },
  {
    id: "command",
    name: "Command",
    group: "Primitives",
    source: "packages/ui/src/components/command.tsx",
    render: () => <CommandDemo />,
  },
  {
    id: "dialog",
    name: "Dialog",
    group: "Primitives",
    source: "packages/ui/src/components/dialog.tsx",
    render: () => <DialogDemo />,
  },
  {
    id: "alert-dialog",
    name: "AlertDialog",
    group: "Primitives",
    source: "packages/ui/src/components/alert-dialog.tsx",
    render: () => <AlertDialogDemo />,
  },
  {
    id: "sheet",
    name: "Sheet",
    group: "Primitives",
    source: "packages/ui/src/components/sheet.tsx",
    render: () => <SheetDemo />,
  },
  {
    id: "sonner",
    name: "Toast",
    group: "Primitives",
    source: "packages/ui/src/components/sonner.tsx",
    note: "showToast(variant, message). The Toaster is mounted once by the gallery.",
    render: () => (
      <Row>
        {(["success", "error", "warning", "caution", "info"] as const).map((variant) => (
          <Button
            key={variant}
            variant="secondary"
            size="sm"
            onClick={() => showToast(variant, `A ${variant} toast`)}
          >
            {variant}
          </Button>
        ))}
      </Row>
    ),
  },
  {
    id: "coming-soon",
    name: "ComingSoon",
    group: "Primitives",
    source: "packages/ui/src/components/coming-soon.tsx",
    render: () => (
      <div className="w-full overflow-hidden rounded-lg border">
        <ComingSoon title="Calendar sync" icon={SparklesIcon} className="h-72" />
      </div>
    ),
  },
  {
    id: "icon-search",
    name: "Input with an icon",
    group: "Primitives",
    source: "apps/components/src/gallery/primitives.tsx",
    note: "How the app places an icon inside an Input.",
    render: () => (
      <div className="relative w-full max-w-xs">
        <IconSearch
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input aria-label="Search" placeholder="Search" className="pl-8" />
      </div>
    ),
  },
];
