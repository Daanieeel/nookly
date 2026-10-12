import {
  IconChevronRight,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { AGENT_ENTRY_FILE, type AgentFile } from "#/lib/api/agent-files.ts";

type FolderNode = { kind: "folder"; name: string; path: string; children: AgentTreeNode[] };
export type AgentTreeNode = FolderNode | { kind: "file"; name: string; path: string };

/// Left padding by depth, as whole classes so Tailwind sees them. Depth never passes four.
const INDENT = ["pl-1.5", "pl-4.5", "pl-7.5", "pl-10.5", "pl-13.5"];
const EMPTY_INDENT = ["pl-6.5", "pl-9.5", "pl-12.5", "pl-15.5", "pl-18.5"];

/// Folders first, then files, each alphabetical. The entry file leads the top level.
function order(nodes: AgentTreeNode[], top: boolean) {
  nodes.sort((a, b) => {
    const rank = (n: AgentTreeNode) =>
      n.kind === "file" ? (top && n.path === AGENT_ENTRY_FILE ? 0 : 2) : 1;
    return rank(a) - rank(b) || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  for (const node of nodes) if (node.kind === "folder") order(node.children, false);
}

/// The tree of the agent folder. Empty folders are in it because `folders` lists them.
export function buildAgentTree(files: AgentFile[], folders: string[]): AgentTreeNode[] {
  const root: AgentTreeNode[] = [];
  const byPath = new Map<string, FolderNode>();
  const folderAt = (path: string): AgentTreeNode[] => {
    if (!path) return root;
    const known = byPath.get(path);
    if (known) return known.children;
    const slash = path.lastIndexOf("/");
    const children: AgentTreeNode[] = [];
    const node: FolderNode = { kind: "folder", name: path.slice(slash + 1), path, children };
    folderAt(slash < 0 ? "" : path.slice(0, slash)).push(node);
    byPath.set(path, node);
    return node.children;
  };
  for (const folder of folders) folderAt(folder);
  for (const file of files) {
    const slash = file.name.lastIndexOf("/");
    folderAt(slash < 0 ? "" : file.name.slice(0, slash)).push({
      kind: "file",
      name: file.name.slice(slash + 1),
      path: file.name,
    });
  }
  order(root, true);
  return root;
}

/// The vertical file explorer: folders open and close, files open in the editor.
export function AgentFileTree({
  nodes,
  selected,
  activeFolder,
  open,
  onOpenFile,
  onToggleFolder,
  onDeleteFolder,
}: {
  nodes: AgentTreeNode[];
  selected: string;
  /// The folder new files and folders are made in.
  activeFolder: string;
  open: ReadonlySet<string>;
  onOpenFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
}) {
  const rows = (list: AgentTreeNode[], depth: number) => (
    <ul className="flex flex-col gap-px">
      {list.map((node) => {
        const indent = INDENT[Math.min(depth, INDENT.length - 1)];
        if (node.kind === "file") {
          return (
            <li key={node.path}>
              <button
                type="button"
                title={node.path}
                aria-current={node.path === selected ? "true" : undefined}
                onClick={() => onOpenFile(node.path)}
                className={cn(
                  indent,
                  "flex w-full min-w-0 items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm hover:bg-accent",
                  node.path === selected && "bg-accent font-medium",
                )}
              >
                <IconFile size={14} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{node.name}</span>
              </button>
            </li>
          );
        }
        const expanded = open.has(node.path);
        return (
          <li key={node.path}>
            <div
              className={cn(
                "group flex items-center rounded-md hover:bg-accent",
                node.path === activeFolder && "bg-accent/60",
              )}
            >
              <button
                type="button"
                title={node.path}
                aria-expanded={expanded}
                onClick={() => onToggleFolder(node.path)}
                className={cn(
                  indent,
                  "flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1 text-left text-sm",
                )}
              >
                <IconChevronRight
                  size={12}
                  className={cn(
                    "shrink-0 text-muted-foreground transition-transform",
                    expanded && "rotate-90",
                  )}
                />
                {expanded ? (
                  <IconFolderOpen size={14} className="shrink-0 text-muted-foreground" />
                ) : (
                  <IconFolder size={14} className="shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{node.name}</span>
              </button>
              <span className="shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mr-0.5 size-6"
                      aria-label={`Delete Folder ${node.name}`}
                      onClick={() => onDeleteFolder(node.path)}
                    >
                      <IconTrash size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete Folder</TooltipContent>
                </Tooltip>
              </span>
            </div>
            {expanded &&
              (node.children.length > 0 ? (
                rows(node.children, depth + 1)
              ) : (
                <p
                  className={cn(
                    "py-1 text-xs text-muted-foreground",
                    EMPTY_INDENT[Math.min(depth, EMPTY_INDENT.length - 1)],
                  )}
                >
                  Empty
                </p>
              ))}
          </li>
        );
      })}
    </ul>
  );
  return (
    <nav aria-label="Agent files" className="min-h-0 flex-1 overflow-y-auto p-1">
      {rows(nodes, 0)}
    </nav>
  );
}
