import { MODULE_LABELS, isModuleKey, moduleForEntityType } from "@nookly/shared/modules";
import {
  IconChevronRight,
  IconFolder,
  IconLayoutDashboard,
  IconSchool,
  IconSearch,
  IconSettings,
  IconTrash,
  type Icon,
} from "@tabler/icons-react-native";
import { Fragment, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useEntity, useParentTask, useSpaces } from "../data/queries.ts";
import { SpaceIcon } from "../screens/SpaceIcon.tsx";
import { TOP_ICONS } from "../screens/Sidebar.tsx";
import { cn } from "../ui/classes.ts";
import { EntityIcon, MODULE_ICONS } from "../ui/icons.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { MIN_TOUCH } from "../ui/touch.ts";
import { matchPage } from "./pages.tsx";
import { titleOfPath } from "./titles.ts";
import { titleKey, usePageTitles } from "./PageHost.tsx";
import { workspace } from "./workspace-store.ts";

/// The desktop titlebar's crumbs (`titlebar.tsx`) for the focused tab: the Space's icon
/// and name, the module, the item; a saved View's name after its module. A crumb with
/// somewhere to go opens it in the same tab.

interface Crumb {
  key: string;
  icon: ReactNode;
  label: string;
  /// Where it leads, if anywhere.
  to?: string;
}

const PAGE_ICONS = new Map<string, Icon>([
  ["", IconLayoutDashboard],
  ["calendar", TOP_ICONS.calendar.glyph],
  ["tasks", TOP_ICONS.tasks.glyph],
  ["assignments", TOP_ICONS.assignments.glyph],
  ["pinned", TOP_ICONS.pinned.glyph],
  ["search", IconSearch],
  ["trash", IconTrash],
]);

const ICON = 15;

function useCrumbs(path: string): Crumb[] {
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  const match = matchPage(path);
  const pattern = match?.pattern ?? "";
  const params = match?.params ?? {};
  const itemId = pattern === "entity/[id]" || pattern === "file/[id]" ? params.id : undefined;
  const { data: item } = useEntity(itemId ?? "");
  const { data: view } = useEntity(params.view ?? "");
  const { data: parent } = useParentTask(item?.type === "sub_task" ? item.id : "");
  const { data: spaces = [] } = useSpaces();
  const fallback = usePathTitle(path);
  const spaceCrumb = (spaceId: string | undefined): Crumb[] => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return [];
    return [
      {
        key: `space ${space.id}`,
        icon: <SpaceIcon space={space} size={ICON} />,
        label: space.name,
      },
    ];
  };
  const moduleCrumb = (spaceId: string, module: string, linked: boolean): Crumb[] => {
    if (!isModuleKey(module)) return [];
    const Glyph = MODULE_ICONS[module];
    return [
      {
        key: `module ${module}`,
        icon: <Glyph size={ICON} color={muted} />,
        label: MODULE_LABELS[module],
        to: linked ? `/module/${spaceId}/${module}` : undefined,
      },
    ];
  };
  const viewCrumb: Crumb[] = view
    ? [
        {
          key: `view ${view.id}`,
          icon: <EntityIcon type={view.type} icon={view.icon} size={ICON} />,
          label: view.title,
        },
      ]
    : [];
  if (pattern === "module/[spaceId]/[module]") {
    return [
      ...spaceCrumb(params.spaceId),
      ...moduleCrumb(params.spaceId, params.module, view !== undefined && view !== null),
      ...viewCrumb,
    ];
  }
  if (itemId) {
    if (!item) return [];
    const module = moduleForEntityType(item.type);
    const task = module === "tasks";
    return [
      ...spaceCrumb(item.spaceId),
      ...(module ? moduleCrumb(item.spaceId, module, true) : []),
      // A sub-task's parent before it, as the desktop's Tasks › TSK-3 › TSK-7.
      ...(parent
        ? [
            {
              key: `parent ${parent.id}`,
              icon: <EntityIcon type={parent.type} icon={parent.icon} size={ICON} />,
              label: parent.key,
              to: `/entity/${parent.id}`,
            },
          ]
        : []),
      {
        key: `item ${item.id}`,
        icon: <EntityIcon type={item.type} icon={item.icon} size={ICON} />,
        // Tasks read by their key alone, as on the desktop (Tasks › TSK-7).
        label: task ? item.key : item.title || item.key,
      },
    ];
  }
  if (pattern === "space/[id]" || pattern === "space-settings/[id]") {
    const crumbs = spaceCrumb(params.id);
    return pattern === "space/[id]"
      ? crumbs
      : [
          ...crumbs,
          {
            key: "space settings",
            icon: <IconSettings size={ICON} color={muted} />,
            label: "Space Settings",
          },
        ];
  }
  if (pattern.startsWith("moodle")) {
    return [
      { key: "moodle", icon: <IconSchool size={ICON} color={muted} />, label: "Moodle" },
      ...(pattern === "moodle/[courseId]" ? [] : [{ key: "page", icon: null, label: fallback }]),
    ];
  }
  const Glyph =
    PAGE_ICONS.get(pattern) ?? (pattern.startsWith("settings") ? IconSettings : IconFolder);
  const base = path.split("?")[0];
  return [
    {
      key: `page ${pattern}`,
      icon: <Glyph size={ICON} color={muted} />,
      label: titleOfPath(base) ?? fallback,
      to: view ? base : undefined,
    },
    ...viewCrumb,
  ];
}

/// A page's name for its tab: the item's own title, what the page called itself, or the
/// page's name.
export function usePathTitle(path: string, tabId?: string): string {
  const id = /^\/entity\/([^/?]+)/.exec(path)?.[1];
  const { data: entity } = useEntity(id ?? "");
  const own = usePageTitles((s) => (tabId ? s.titles[titleKey(tabId, path)] : undefined));
  if (entity) return entity.title || entity.key;
  return own ?? titleOfPath(path) ?? "Untitled";
}

/// The icon of what `path` shows: its last crumb's (a pinned tab's face).
export function PathIcon({ path }: { path: string }) {
  return <>{useCrumbs(path).at(-1)?.icon ?? null}</>;
}

/// The crumbs of `path`; `short` keeps only the last (a medium window's titlebar).
export function Crumbs({ path, short }: { path: string; short: boolean }) {
  const theme = useTheme();
  const all = useCrumbs(path);
  const crumbs = short ? all.slice(-1) : all;
  return (
    <View
      testID="crumbs"
      className="min-w-0 flex-shrink flex-row items-center"
      accessibilityRole="header"
    >
      {crumbs.map((crumb, i) => (
        <Fragment key={crumb.key}>
          {i > 0 ? (
            <IconChevronRight
              size={12}
              color={theme.colors.mutedForeground}
              style={{ opacity: 0.5 }}
            />
          ) : null}
          <CrumbView crumb={crumb} last={i === crumbs.length - 1} />
        </Fragment>
      ))}
    </View>
  );
}

function CrumbView({ crumb, last }: { crumb: Crumb; last: boolean }) {
  const body = (
    <View className="min-w-0 flex-row items-center gap-1.5 px-1.5">
      {crumb.icon}
      <Text
        variant="small"
        numberOfLines={1}
        className={cn("max-w-48 font-medium", !last && "text-muted-foreground")}
      >
        {crumb.label}
      </Text>
    </View>
  );
  const to = crumb.to;
  if (!to) return <View className="min-w-0 flex-shrink">{body}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={crumb.label}
      onPress={() => workspace.open(to)}
      style={{ minHeight: MIN_TOUCH, justifyContent: "center" }}
      className="min-w-0 flex-shrink rounded-md active:bg-accent"
    >
      {body}
    </Pressable>
  );
}
