import type {
  ExportBlock,
  ExportDocument,
  ExportImage,
  FigureSource,
  ListItem,
  Run,
  TableCell,
} from "./document-model.ts";

/// What turns a page's figures and links into something a file can hold. The app's own
/// (`figure-renderers.ts`) draws in the webview; tests pass their own.
export interface FigureRenderers {
  /// A formula drawn, inline math at text size when `inline`.
  math: (latex: string, inline: boolean) => Promise<ExportImage | null>;
  diagram: (source: string) => Promise<ExportImage | null>;
  circuit: (source: string) => Promise<ExportImage | null>;
  plot: (source: string) => Promise<ExportImage | null>;
  image: (source: { fileId?: string; url?: string; path?: string }) => Promise<ExportImage | null>;
  /// Where a link to an entity points outside Nookly (a File's or Bookmark's URL), or null
  /// when it points nowhere there, which leaves its text unlinked.
  mentionUrl: (entityId: string) => Promise<string | null>;
}

const MENTION_LINK = /^mention:([a-zA-Z0-9-]+)/;

/// Never let one figure that failed to draw stop the export: it shows its source instead.
async function attempt<T>(draw: () => Promise<T | null>): Promise<T | null> {
  try {
    return await draw();
  } catch {
    return null;
  }
}

function drawFigure(source: FigureSource, renderers: FigureRenderers) {
  switch (source.type) {
    case "math":
      return attempt(() => renderers.math(source.latex, false));
    case "diagram":
      return attempt(() => renderers.diagram(source.source));
    case "circuit":
      return attempt(() => renderers.circuit(source.source));
    case "plot":
      return attempt(() => renderers.plot(source.source));
    case "image":
      return attempt(() => renderers.image(source));
  }
}

/// The document with every figure and inline formula drawn and every link to an entity
/// pointed at its URL, ready for any writer. Done once per export, since drawing is slow
/// and the writers run again on every option change.
export async function resolveDocument(
  doc: ExportDocument,
  renderers: FigureRenderers,
): Promise<ExportDocument> {
  const urls = new Map<string, Promise<string | null>>();
  const mentionUrl = (id: string) => {
    let url = urls.get(id);
    if (!url) {
      url = attempt(() => renderers.mentionUrl(id));
      urls.set(id, url);
    }
    return url;
  };

  const resolveRuns = (runs: Run[]): Promise<Run[]> =>
    Promise.all(
      runs.map(async (run): Promise<Run> => {
        if (run.kind === "math") {
          const image = await attempt(() => renderers.math(run.latex, true));
          return image ? { ...run, image } : run;
        }
        const mention = run.link ? MENTION_LINK.exec(run.link) : null;
        if (!mention?.[1]) return run;
        const { link: _, ...rest } = run;
        const url = await mentionUrl(mention[1]);
        return url ? { ...rest, link: url } : rest;
      }),
    );

  const resolveItems = (items: ListItem[]): Promise<ListItem[]> =>
    Promise.all(
      items.map(async (item) => ({
        ...item,
        runs: await resolveRuns(item.runs),
        children: await resolveItems(item.children),
      })),
    );

  const resolveCell = async (cell: TableCell): Promise<TableCell> => ({
    ...cell,
    runs: await resolveRuns(cell.runs),
  });

  const resolveBlock = async (block: ExportBlock): Promise<ExportBlock> => {
    switch (block.kind) {
      case "heading":
      case "paragraph":
      case "quote":
      case "callout":
        return { ...block, runs: await resolveRuns(block.runs) };
      case "list":
        return { ...block, items: await resolveItems(block.items) };
      case "table":
        return {
          ...block,
          rows: await Promise.all(block.rows.map((row) => Promise.all(row.map(resolveCell)))),
        };
      case "figure": {
        const image = await drawFigure(block.source, renderers);
        return image ? { ...block, image } : block;
      }
      default:
        return block;
    }
  };

  return { ...doc, blocks: await Promise.all(doc.blocks.map(resolveBlock)) };
}
