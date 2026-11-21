"use client";

import {
  IconBell,
  IconCalendar,
  IconFolder,
  IconListCheck,
  IconPlus,
  IconSettings,
  IconTrash,
  IconX,
} from "@tabler/icons-react-native";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { Badge, SpaceDot } from "@mobile/ui/Badge.tsx";
import { BrandButton } from "@mobile/ui/BrandButton.tsx";
import { Button, IconButton } from "@mobile/ui/Button.tsx";
import { Chip, ChipGroup } from "@mobile/ui/Chips.tsx";
import { AtAGlance, GlanceProvider, PartProvider } from "@mobile/ui/parts.tsx";
import { RecipeTagChip } from "@mobile/screens/RecipeTagChip.tsx";
import { Card } from "@mobile/ui/kit/Card.tsx";
import { Pill } from "@mobile/ui/sheet/Compose.tsx";
import { RoundButton } from "@mobile/ui/sheet/Floating.tsx";
import { Field } from "@mobile/ui/Field.tsx";
import { NumberInput } from "@mobile/ui/NumberInput.tsx";
import { PageTabs } from "@mobile/ui/PageTabs.tsx";
import { ProgressRing } from "@mobile/ui/ProgressRing.tsx";
import { Property, PropertyList } from "@mobile/ui/Property.tsx";
import { Row, Section } from "@mobile/ui/Row.tsx";
import { Segmented } from "@mobile/ui/Segmented.tsx";
import { Text } from "@mobile/ui/Text.tsx";
import { ColorChoices } from "@mobile/ui/kit/ColorChoices.tsx";
import { FormSection } from "@mobile/ui/kit/Form.tsx";
import { GroupedSection } from "@mobile/ui/kit/GroupedSection.tsx";
import { IconBadge } from "@mobile/ui/kit/IconBadge.tsx";
import { ListRow } from "@mobile/ui/kit/ListRow.tsx";
import { SearchField } from "@mobile/ui/kit/SearchField.tsx";
import { EmptyState, ErrorState, LoadingState } from "@mobile/ui/kit/States.tsx";
import { ConfirmContent } from "@mobile/ui/sheet/Confirm.tsx";
import { DayPicker } from "@mobile/ui/sheet/DayPicker.tsx";
import {
  DisplayGroup,
  FilterField,
  LayoutTiles,
  SwitchRow,
} from "@mobile/ui/sheet/DisplayParts.tsx";
import { MenuList } from "@mobile/ui/sheet/MenuList.tsx";
import { OptionList } from "@mobile/ui/sheet/OptionList.tsx";
import type { GalleryEntry } from "../types";

const ui = (file: string) => `apps/mobile/src/ui/${file}`;

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
const BADGE_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "neutral",
  "positive",
  "caution",
  "warning",
  "destructive",
] as const;

function Wrap({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>;
}

/// What a sheet holds, in a frame like the one it opens in: the sheet itself needs the phone's
/// host and its gestures, so the gallery shows the content, which is the part that is designed.
function SheetFrame({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        overflow: "hidden",
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "var(--border)",
        backgroundColor: "var(--popover)",
        padding: 16,
      }}
    >
      {children}
    </View>
  );
}

function OptionsDemo() {
  const [value, setValue] = useState<string | null>("medium");
  return (
    <SheetFrame>
      <OptionList
        label="Priority"
        value={value}
        onChange={setValue}
        search={false}
        options={[
          {
            id: "low",
            label: "Low",
            glyph: IconBell,
            tint: "green",
            subtitle: "Whenever there is time",
          },
          { id: "medium", label: "Medium", glyph: IconBell, tint: "yellow", subtitle: "This week" },
          {
            id: "high",
            label: "High",
            glyph: IconBell,
            tint: "red",
            subtitle: "Today",
            detail: "!",
          },
        ]}
      />
    </SheetFrame>
  );
}

function FilterDemo() {
  const [status, setStatus] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>(["a", "b"]);
  const options = (names: string[]) => names.map((n, i) => ({ id: String(i), label: n }));
  return (
    <SheetFrame>
      <DisplayGroup>
        <FilterField
          label="Status"
          icon={IconBell}
          options={options(["Open", "Done"])}
          values={status}
          onChange={setStatus}
        />
        <FilterField
          label="Labels"
          icon={IconBell}
          options={options(["Biology", "Maths", "Reading"])}
          values={labels}
          onChange={setLabels}
        />
        <FilterField
          label="Due date"
          icon={IconBell}
          options={options(["Today", "This week"])}
          values={["0", "1", "2"]}
          onChange={() => {}}
        />
      </DisplayGroup>
    </SheetFrame>
  );
}

function DisplayDemo() {
  const [layout, setLayout] = useState("list");
  const [subtasks, setSubtasks] = useState(true);
  return (
    <SheetFrame>
      <View style={{ gap: 8 }}>
        <LayoutTiles
          tiles={[
            { id: "list", label: "List", icon: IconBell },
            { id: "board", label: "Board", icon: IconBell },
          ]}
          value={layout}
          onSelect={setLayout}
        />
        <DisplayGroup>
          <SwitchRow label="Show sub-tasks" value={subtasks} onChange={setSubtasks} />
          <SwitchRow label="Show completed" value={false} onChange={() => {}} />
        </DisplayGroup>
      </View>
    </SheetFrame>
  );
}

function DayDemo() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <SheetFrame>
      <DayPicker label="Due" value={value} onChange={setValue} clearable />
    </SheetFrame>
  );
}

function SegmentedDemo() {
  const [value, setValue] = useState("board");
  return (
    <Segmented
      label="View"
      value={value}
      onChange={setValue}
      options={[
        { value: "list", label: "List" },
        { value: "board", label: "Board" },
        { value: "calendar", label: "Calendar" },
      ]}
    />
  );
}

function PageTabsDemo() {
  const [value, setValue] = useState("notes");
  return (
    <PageTabs
      label="Course"
      value={value}
      onChange={setValue}
      tabs={[
        { id: "notes", label: "Notes", count: 12 },
        { id: "tasks", label: "Tasks", count: 4 },
        { id: "files", label: "Files" },
      ]}
    />
  );
}

function ChipsDemo() {
  const [picked, setPicked] = useState(["Exam"]);
  const toggle = (name: string) =>
    setPicked((now) => (now.includes(name) ? now.filter((n) => n !== name) : [...now, name]));
  return (
    <ChipGroup label="Labels" multiple>
      {["Exam", "Reading", "Group work"].map((name) => (
        <Chip
          key={name}
          label={name}
          multiple
          selected={picked.includes(name)}
          onPress={() => toggle(name)}
        />
      ))}
    </ChipGroup>
  );
}

function NumberDemo() {
  const [value, setValue] = useState(3);
  return <NumberInput label="Count" value={value} onChange={setValue} min={0} max={10} />;
}

function SearchDemo() {
  const [value, setValue] = useState("");
  return <SearchField label="Search tasks" value={value} onChangeText={setValue} />;
}

function ColorDemo() {
  const [value, setValue] = useState<string | null>("#6366f1");
  return (
    <ColorChoices
      label="Colour"
      colors={["#6366f1", "#ef4444", "#22c55e", "#f59e0b", "#06b6d4", "#d946ef"]}
      value={value}
      onChange={setValue}
      none="No colour"
    />
  );
}

export const MOBILE_GALLERY: GalleryEntry[] = [
  {
    id: "m-text",
    name: "Text",
    group: "Controls",
    source: ui("Text.tsx"),
    render: () => (
      <>
        <Text variant="title">Title</Text>
        <Text variant="heading">Heading</Text>
        <Text>Body text in the app's type scale.</Text>
        <Text variant="label">Label</Text>
        <Text variant="small" tone="muted">
          Small and muted
        </Text>
        <Wrap>
          {(["primary", "destructive", "positive", "caution"] as const).map((tone) => (
            <Text key={tone} tone={tone}>
              {tone}
            </Text>
          ))}
        </Wrap>
      </>
    ),
  },
  {
    id: "m-button",
    name: "Button",
    group: "Controls",
    source: ui("Button.tsx"),
    render: () => (
      <>
        <Wrap>
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} label={variant} variant={variant} />
          ))}
        </Wrap>
        <Wrap>
          <Button label="Small" size="sm" />
          <Button label="Large" size="lg" />
          <Button label="Disabled" disabled />
        </Wrap>
        <Wrap>
          <Button label="Saving" status="pending" />
          <Button label="Saved" status="success" />
          <Button label="Save" status="error" errorLabel="Failed" />
        </Wrap>
      </>
    ),
  },
  {
    id: "m-icon-button",
    name: "IconButton",
    group: "Controls",
    source: ui("Button.tsx"),
    render: () => (
      <Wrap>
        <IconButton label="New" icon={<IconPlus size={18} color="var(--foreground)" />} />
        <IconButton
          label="Settings"
          variant="secondary"
          icon={<IconSettings size={18} color="var(--foreground)" />}
        />
        <IconButton
          label="Delete"
          variant="destructive"
          icon={<IconTrash size={18} color="var(--destructive)" />}
        />
      </Wrap>
    ),
  },
  {
    id: "m-brand-button",
    name: "BrandButton",
    group: "Controls",
    source: ui("BrandButton.tsx"),
    render: () => <BrandButton label="Continue with Apple" />,
  },
  {
    id: "m-badge",
    name: "Badge",
    group: "Controls",
    source: ui("Badge.tsx"),
    render: () => (
      <>
        <Wrap>
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} label={variant} variant={variant} />
          ))}
        </Wrap>
        <Wrap>
          {(["sm", "md", "lg"] as const).map((size) => (
            <Badge key={size} label={size} size={size} />
          ))}
          <SpaceDot color="#6366f1" />
        </Wrap>
      </>
    ),
  },
  {
    id: "m-segmented",
    name: "Segmented",
    group: "Controls",
    source: ui("Segmented.tsx"),
    render: () => <SegmentedDemo />,
  },
  {
    id: "m-page-tabs",
    name: "PageTabs",
    group: "Controls",
    source: ui("PageTabs.tsx"),
    render: () => <PageTabsDemo />,
  },
  {
    id: "m-chips",
    name: "Chip and ChipGroup",
    group: "Controls",
    source: ui("Chips.tsx"),
    render: () => <ChipsDemo />,
  },
  {
    id: "m-progress-ring",
    name: "ProgressRing",
    group: "Controls",
    source: ui("ProgressRing.tsx"),
    render: () => (
      <Wrap>
        {[0, 0.25, 0.6, 1].map((value) => (
          <ProgressRing key={value} value={value} size={24} />
        ))}
      </Wrap>
    ),
  },
  {
    id: "m-field",
    name: "Field",
    group: "Inputs",
    source: ui("Field.tsx"),
    render: () => (
      <>
        <Field label="Name" placeholder="Name" />
        <Field label="Notes" multiline placeholder="Notes" />
        <Field label="Email" defaultValue="not an email" error="Enter a valid email." />
      </>
    ),
  },
  {
    id: "m-number-input",
    name: "NumberInput",
    group: "Inputs",
    source: ui("NumberInput.tsx"),
    render: () => <NumberDemo />,
  },
  {
    id: "m-search-field",
    name: "SearchField",
    group: "Inputs",
    source: ui("kit/SearchField.tsx"),
    render: () => <SearchDemo />,
  },
  {
    id: "m-color-choices",
    name: "ColorChoices",
    group: "Inputs",
    source: ui("kit/ColorChoices.tsx"),
    render: () => <ColorDemo />,
  },
  {
    id: "m-list-row",
    name: "GroupedSection and ListRow",
    group: "Lists",
    source: ui("kit/ListRow.tsx"),
    render: () => (
      <GroupedSection title="Spaces" footer="Pick the one to open.">
        <ListRow
          badge={<IconBadge glyph={IconFolder} tint="blue" />}
          title="Spring term"
          subtitle="12 open tasks"
          accessory="chevron"
        />
        <ListRow
          badge={<IconBadge glyph={IconCalendar} tint="green" />}
          title="Calendar"
          detail="Mon"
          accessory="check"
          selected
        />
        <ListRow
          badge={<IconBadge glyph={IconTrash} tint="red" />}
          title="Delete space"
          destructive
        />
      </GroupedSection>
    ),
  },
  {
    id: "m-form-section",
    name: "FormSection",
    group: "Lists",
    source: ui("kit/Form.tsx"),
    render: () => (
      <FormSection title="Details" footer="Shown on the dashboard.">
        <Field label="Name" defaultValue="Spring term" />
        <Field label="Code" placeholder="BIO101" />
      </FormSection>
    ),
  },
  {
    id: "m-row",
    name: "Row and Section",
    group: "Lists",
    source: ui("Row.tsx"),
    render: () => (
      <Section title="Tasks">
        <Row
          title="Read chapter 4"
          subtitle="Biology"
          icon={<IconListCheck size={18} color="#888" />}
        />
        <Row title="Lab report" subtitle="Due Wednesday" trailing={<Badge label="open" />} />
        <Row title="Deleted task" muted />
      </Section>
    ),
  },
  {
    id: "m-icon-badge",
    name: "IconBadge",
    group: "Lists",
    source: ui("kit/IconBadge.tsx"),
    render: () => (
      <Wrap>
        {(["blue", "green", "pink", "purple", "yellow", "red", "gray"] as const).map((tint) => (
          <IconBadge key={tint} glyph={IconBell} tint={tint} />
        ))}
      </Wrap>
    ),
  },
  {
    id: "m-states",
    name: "EmptyState, LoadingState, ErrorState",
    group: "States",
    source: ui("kit/States.tsx"),
    render: () => (
      <>
        <EmptyState
          glyph={IconListCheck}
          title="No tasks yet"
          message="Tasks you add show up here."
          action={{ label: "New task", onPress: () => {} }}
        />
        <LoadingState />
        <ErrorState message="Could not load your tasks." onRetry={() => {}} />
      </>
    ),
  },
  {
    id: "m-property",
    name: "Property",
    group: "Lists",
    source: ui("Property.tsx"),
    render: () => (
      <PropertyList>
        <Property
          icon={<IconListCheck size={18} color="#888" />}
          label="Status"
          value="In progress"
        />
        <Property
          icon={<IconCalendar size={18} color="#888" />}
          label="Due"
          value="Friday"
          chipText="Friday"
        />
        <Property icon={<IconFolder size={18} color="#888" />} label="Space" value="" empty />
      </PropertyList>
    ),
  },
  {
    id: "m-sheet-options",
    name: "Sheet: option list",
    group: "Sheets",
    source: ui("sheet/OptionList.tsx"),
    note: "The content of a picker sheet: icon rows with a subtitle and a check on the chosen one.",
    render: () => <OptionsDemo />,
  },
  {
    id: "m-card",
    name: "Card",
    group: "Lists",
    source: ui("kit/Card.tsx"),
    render: () => (
      <View style={{ gap: 12 }}>
        <Card onPress={() => {}} accessibilityLabel="Shakshuka">
          <View style={{ padding: 12, gap: 8 }}>
            <Text>Shakshuka</Text>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <Badge label="Breakfast" variant="secondary" size="sm" />
              <RecipeTagChip
                tag={{ id: "1", name: "Vegetarian", color: "#16a34a", icon: "leaf" }}
              />
              <RecipeTagChip tag={{ id: "2", name: "Pasta", color: "#d97706", icon: "chef" }} />
              <RecipeTagChip tag={{ id: "3", name: "Quick", color: "#0891b2", icon: "bolt" }} />
            </View>
          </View>
        </Card>
        <Card accent>
          <View style={{ padding: 12 }}>
            <Text>The next one</Text>
          </View>
        </Card>
      </View>
    ),
  },
  {
    id: "m-pill",
    name: "Pill, round button, property chip",
    group: "Controls",
    source: ui("sheet/Compose.tsx"),
    render: () => (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Pill label="Priority" value={null} onPress={() => {}} />
          <Pill label="Due" value="Tomorrow" onPress={() => {}} />
          <Pill label="All day" value={null} checked onPress={() => {}} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <RoundButton label="Close" onPress={() => {}}>
            <IconX size={22} color="var(--foreground)" />
          </RoundButton>
          <RoundButton label="Send" tone="primary" onPress={() => {}}>
            <IconPlus size={22} color="#ffffff" />
          </RoundButton>
        </View>
        <PartProvider value="main">
          <GlanceProvider value>
            <AtAGlance>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Property label="Type" value="PDF" icon={<IconListCheck size={16} />} />
                <Property label="Added" value="21 Nov" icon={<IconCalendar size={16} />} />
              </View>
            </AtAGlance>
          </GlanceProvider>
        </PartProvider>
      </View>
    ),
  },
  {
    id: "m-sheet-menu",
    name: "Sheet: menu",
    group: "Sheets",
    source: ui("sheet/MenuList.tsx"),
    render: () => (
      <SheetFrame>
        <MenuList
          entries={[
            { label: "Duplicate", icon: IconPlus, onPress: () => {} },
            { label: "Labels", icon: IconBell, checked: true },
            "separator",
            { label: "Delete", icon: IconTrash, destructive: true },
          ]}
        />
      </SheetFrame>
    ),
  },
  {
    id: "m-sheet-confirm",
    name: "Sheet: confirmation",
    group: "Sheets",
    source: ui("sheet/Confirm.tsx"),
    render: () => (
      <SheetFrame>
        <ConfirmContent
          confirmation={{
            title: "Delete Spring term forever?",
            description: "Its notes, tasks and files are removed. This cannot be undone.",
            stats: [
              { value: 24, label: "notes" },
              { value: 12, label: "tasks" },
            ],
            actions: [{ label: "Delete forever", destructive: true, onPress: () => {} }],
          }}
        />
      </SheetFrame>
    ),
  },
  {
    id: "m-sheet-filter",
    name: "Sheet: filter",
    group: "Sheets",
    source: ui("sheet/DisplayParts.tsx"),
    render: () => <FilterDemo />,
  },
  {
    id: "m-sheet-display",
    name: "Sheet: display",
    group: "Sheets",
    source: ui("sheet/DisplayParts.tsx"),
    render: () => <DisplayDemo />,
  },
  {
    id: "m-sheet-day",
    name: "Sheet: day picker",
    group: "Sheets",
    source: ui("sheet/DayPicker.tsx"),
    render: () => <DayDemo />,
  },
];
