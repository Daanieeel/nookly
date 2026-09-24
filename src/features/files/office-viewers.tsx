import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { IconAlertTriangle, IconBeer, IconDownload, IconExternalLink } from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type ExcelJS from "exceljs";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { StatusButtonContent, StatusIcon } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LIBREOFFICE_INSTALL_EVENT,
  type LibreOfficeInstallProgress,
  convertOfficeToPdf,
  installLibreOffice,
  libreofficeInstallOptions,
  officeConverterAvailable,
} from "@/lib/api/office";
import type { FileEntity } from "@/lib/api/types";
import { useIsDark } from "@/lib/theme";
import { InvertibleDocument, PdfViewer } from "./document-frame";
import { type OfficeFormat, filePath } from "./file-kind";

/// Past these a sheet shows its top left corner; the whole thing is one "Open in" away.
const MAX_ROWS = 2000;
const MAX_COLUMNS = 100;

/// `fallback` is the viewer's "open it elsewhere" placeholder, with an optional hint.
export function OfficeViewer({
  file,
  src,
  format,
  name,
  fallback,
}: {
  file: FileEntity;
  src: string;
  format: OfficeFormat;
  name: string;
  fallback: (hint?: string) => ReactNode;
}) {
  if (format === "docx")
    return <DocxViewer file={file} src={src} name={name} fallback={fallback} />;
  if (format === "xlsx")
    return <SheetViewer file={file} src={src} name={name} fallback={fallback} />;
  return <ConvertedViewer file={file} name={name} fallback={fallback} />;
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <StatusIcon status="pending" idle={null} />
      {label}
    </div>
  );
}

async function fetchBytes(src: string): Promise<ArrayBuffer> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`couldn't read the file (${response.status})`);
  return response.arrayBuffer();
}

/// Word documents drawn in the app by docx-preview, page by page. Pages keep
/// their paper color unless dark colors are switched on, like PDFs.
function DocxViewer({
  file,
  src,
  name,
  fallback,
}: {
  file: FileEntity;
  src: string;
  name: string;
  fallback: (hint?: string) => ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    const body = bodyRef.current;
    const styles = styleRef.current;
    if (!body || !styles) return;
    setState("loading");
    (async () => {
      const [{ renderAsync }, bytes] = await Promise.all([import("docx-preview"), fetchBytes(src)]);
      if (cancelled) return;
      body.replaceChildren();
      styles.replaceChildren();
      await renderAsync(bytes, body, styles, {
        className: "docx",
        inWrapper: true,
        breakPages: true,
        useBase64URL: true,
        renderComments: false,
      });
      if (!cancelled) setState("ready");
    })().catch(() => !cancelled && setState("failed"));
    return () => {
      cancelled = true;
    };
  }, [src]);

  // A document docx-preview can't read may still convert through LibreOffice.
  if (state === "failed") return <ConvertedViewer file={file} name={name} fallback={fallback} />;
  return (
    <InvertibleDocument>
      {(pageClass) => (
        <div
          role="document"
          aria-label={name}
          className={cn(
            "docx-viewer -m-4 h-[calc(100%+2rem)] overflow-auto bg-muted/40",
            pageClass && "docx-inverted",
          )}
        >
          <div ref={styleRef} hidden />
          {state === "loading" && <Loading label="Opening document…" />}
          <div ref={bodyRef} className={cn(state === "loading" && "hidden")} />
        </div>
      )}
    </InvertibleDocument>
  );
}

/// ExcelJS's `argb` ("FF1F2937") as a CSS color; theme and indexed colors, which
/// need the workbook's palette, are left out.
function cssColor(color: Partial<ExcelJS.Color> | undefined): string | undefined {
  const argb = color?.argb;
  return argb && /^[0-9a-f]{8}$/i.test(argb) ? `#${argb.slice(2)}` : undefined;
}

/// Excel's column width is in characters of the default font.
function columnWidth(width: number | undefined): string {
  return `${Math.round((width ?? 8.43) * 7 + 5)}px`;
}

function columnName(index: number): string {
  let name = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/// "A1" to its 1 based row and column.
function cellAddress(ref: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref) ?? ["", "A", "1"];
  const col = [...match[1]].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0);
  return { row: Number(match[2]), col };
}

interface Merge {
  rowSpan: number;
  colSpan: number;
}

/// Merged ranges by their top left cell, plus every cell a merge covers.
function mergesOf(sheet: ExcelJS.Worksheet) {
  const spans = new Map<string, Merge>();
  const covered = new Set<string>();
  const ranges: string[] = sheet.model.merges ?? [];
  for (const range of ranges) {
    const [from, to = from] = range.split(":");
    const a = cellAddress(from);
    const b = cellAddress(to);
    spans.set(`${a.row}:${a.col}`, { rowSpan: b.row - a.row + 1, colSpan: b.col - a.col + 1 });
    for (let r = a.row; r <= b.row; r++) {
      for (let c = a.col; c <= b.col; c++) {
        if (r !== a.row || c !== a.col) covered.add(`${r}:${c}`);
      }
    }
  }
  return { spans, covered };
}

/// Excel workbooks as a grid, one tab per sheet: values, fonts, fills, alignment,
/// column widths and merged cells. Charts and formulas' logic aren't shown.
function SheetViewer({
  file,
  src,
  name,
  fallback,
}: {
  file: FileEntity;
  src: string;
  name: string;
  fallback: (hint?: string) => ReactNode;
}) {
  const { data: loaded, isError } = useQuery({
    queryKey: ["workbook", file.entity.id, src],
    staleTime: Infinity,
    queryFn: async () => {
      const [{ default: Excel }, bytes] = await Promise.all([import("exceljs"), fetchBytes(src)]);
      const book = new Excel.Workbook();
      await book.xlsx.load(bytes);
      return { book, numberType: Excel.ValueType.Number };
    },
  });
  const [active, setActive] = useState(0);

  if (isError) return <ConvertedViewer file={file} name={name} fallback={fallback} />;
  if (!loaded) return <Loading label="Opening spreadsheet…" />;
  const sheets = loaded.book.worksheets.filter(
    (s) => s.state !== "hidden" && s.state !== "veryHidden",
  );
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  if (!sheet) return fallback("This workbook has no visible sheets.");

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] flex-col" role="document" aria-label={name}>
      <SheetGrid key={sheet.id} sheet={sheet} numberType={loaded.numberType} />
      {sheets.length > 1 && (
        <div
          role="tablist"
          aria-label="Sheets"
          className="flex shrink-0 gap-0.5 overflow-x-auto border-t border-border bg-card px-2 py-1"
        >
          {sheets.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s === sheet}
              onClick={() => setActive(i)}
              className={cn(
                "h-7 shrink-0 cursor-pointer rounded-md px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
                s === sheet && "bg-accent font-medium text-foreground",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/// The header column's width, the one fixed width in the grid.
// SAFETY: only the width custom property `.sheet-col` reads.
const ROW_HEADER_COL = { "--col-width": "3rem" } as CSSProperties;

function SheetGrid({
  sheet,
  numberType,
}: {
  sheet: ExcelJS.Worksheet;
  /// `ExcelJS.ValueType.Number`, from the lazily loaded module.
  numberType: ExcelJS.ValueType;
}) {
  const isDark = useIsDark();
  const rowCount = Math.min(sheet.actualRowCount > 0 ? sheet.rowCount : 0, MAX_ROWS);
  const colCount = Math.min(sheet.actualColumnCount > 0 ? sheet.columnCount : 0, MAX_COLUMNS);
  const clipped = sheet.rowCount > MAX_ROWS || sheet.columnCount > MAX_COLUMNS;
  const { spans, covered } = mergesOf(sheet);
  const columns = Array.from({ length: colCount }, (_, i) => i + 1);

  if (rowCount === 0) {
    return <p className="m-auto text-sm text-muted-foreground">This sheet is empty.</p>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="border-separate border-spacing-0 text-xs tabular-nums">
        <colgroup>
          <col className="sheet-col" style={ROW_HEADER_COL} />
          {columns.map((c) => (
            <col
              key={c}
              className="sheet-col"
              // SAFETY: only the width custom property `.sheet-col` reads.
              style={{ "--col-width": columnWidth(sheet.getColumn(c).width) } as CSSProperties}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-20 border-r border-b border-border bg-muted">
              <span className="sr-only">Row</span>
            </th>
            {columns.map((c) => (
              <th
                key={c}
                className="sticky top-0 z-10 h-6 border-r border-b border-border bg-muted px-1 font-normal text-muted-foreground"
              >
                {columnName(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, i) => i + 1).map((r) => {
            const row = sheet.getRow(r);
            return (
              <tr key={r}>
                <th className="sticky left-0 z-10 h-6 border-r border-b border-border bg-muted px-1 text-right font-normal text-muted-foreground">
                  {r}
                </th>
                {columns.map((c) => {
                  if (covered.has(`${r}:${c}`)) return null;
                  const cell = row.getCell(c);
                  const span = spans.get(`${r}:${c}`);
                  const fill =
                    cell.fill?.type === "pattern" && cell.fill.pattern === "solid"
                      ? cssColor(cell.fill.fgColor)
                      : undefined;
                  // Black or white text only makes sense on its own fill; on the
                  // app's background it follows the theme instead.
                  const font = cssColor(cell.font?.color);
                  const themed =
                    !fill && ["#000000", "#FFFFFF"].includes(font?.toUpperCase() ?? "");
                  const color = themed ? undefined : font;
                  const numeric = cell.type === numberType;
                  return (
                    <td
                      key={c}
                      rowSpan={span?.rowSpan}
                      colSpan={span?.colSpan}
                      className={cn(
                        "sheet-cell h-6 max-w-0 truncate border-r border-b border-border/60 px-1.5",
                        // Fills are nearly always light, so their text stays dark in dark mode.
                        fill && isDark && "sheet-cell-on-fill",
                      )}
                      // SAFETY: only the `--cell-*` custom properties `.sheet-cell` reads,
                      // each built from the workbook's own colors and alignment.
                      style={
                        {
                          "--cell-fill": fill,
                          "--cell-color": color,
                          "--cell-weight": cell.font?.bold ? "600" : undefined,
                          "--cell-style": cell.font?.italic ? "italic" : undefined,
                          "--cell-align":
                            cell.alignment?.horizontal ?? (numeric ? "right" : undefined),
                        } as CSSProperties
                      }
                      title={cell.text.length > 20 ? cell.text : undefined}
                    >
                      {cell.text}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {clipped && (
        <p className="sticky left-0 px-3 py-2 text-xs text-muted-foreground">
          Showing the first {MAX_ROWS} rows and {MAX_COLUMNS} columns.
        </p>
      )}
    </div>
  );
}

/// Formats the app can't draw itself, as PDF through LibreOffice. Without it,
/// the placeholder says what would make a preview possible.
function ConvertedViewer({
  file,
  name,
  fallback,
}: {
  file: FileEntity;
  name: string;
  fallback: (hint?: string) => ReactNode;
}) {
  const { data: available, isPending: checking } = useQuery({
    queryKey: ["office-converter"],
    queryFn: officeConverterAvailable,
    staleTime: 60_000,
  });
  const { data: pdf, isError } = useQuery({
    queryKey: ["office-pdf", file.entity.id, filePath(file)],
    queryFn: () => convertOfficeToPdf(file.entity.id),
    enabled: available === true,
    staleTime: Infinity,
    retry: false,
  });

  if (checking) return <Loading label="Opening…" />;
  if (!available) {
    return (
      <div className="relative size-full">
        {fallback()}
        <InstallLibreOffice />
      </div>
    );
  }
  if (isError) return fallback("LibreOffice couldn't convert this file.");
  if (!pdf) return <Loading label="Converting with LibreOffice…" />;
  return <PdfViewer src={convertFileSrc(pdf)} name={name} />;
}

const LIBREOFFICE_DOWNLOADS = "https://www.libreoffice.org/download/download-libreoffice/";

/// "Downloading 42%", "Installing…": what an install is doing right now.
function progressLabel(progress: LibreOfficeInstallProgress | null): string {
  if (!progress || progress.phase === "starting") return "Starting…";
  if (progress.phase === "downloading") {
    return progress.percent === null
      ? "Downloading…"
      : `Downloading ${Math.round(progress.percent)}%`;
  }
  return progress.phase === "installing" ? "Installing…" : "Installed";
}

/// A card along the bottom of the viewer offering one click LibreOffice installs:
/// through Homebrew when it's there, or the official disk image, which Nookly
/// checks before copying it to Applications. Elsewhere, the download page.
function InstallLibreOffice() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<LibreOfficeInstallProgress | null>(null);
  const { data: options } = useQuery({
    queryKey: ["libreoffice-install-options"],
    queryFn: libreofficeInstallOptions,
  });
  const install = useMutation({
    mutationFn: (method: "brew" | "direct") => installLibreOffice(method),
    onMutate: () => setProgress(null),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["office-converter"] }),
        queryClient.invalidateQueries({ queryKey: ["office-pdf"] }),
      ]),
  });

  useEffect(() => {
    const unlisten = listen<LibreOfficeInstallProgress>(LIBREOFFICE_INSTALL_EVENT, (event) =>
      setProgress(event.payload),
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  if (!options) return null;
  const running = install.isPending ? install.variables : undefined;
  const failed = install.isError ? install.variables : undefined;
  const button = (method: "brew" | "direct", label: string, icon: ReactNode) => {
    // The recommended route is the caution one: Homebrew when it's there.
    const variant = method === "brew" || !options.brew ? "caution" : "ghost";
    return (
      <Button
        variant={variant}
        size="sm"
        className="gap-1.5"
        disabled={install.isPending && running !== method}
        onClick={() => !install.isPending && install.mutate(method)}
      >
        <StatusButtonContent
          status={running === method ? "pending" : failed === method ? "error" : "idle"}
          icon={icon}
          label={running === method ? progressLabel(progress) : label}
          errorLabel="Couldn't install, try again"
          pendingClassName={variant === "caution" ? "text-caution" : undefined}
        />
      </Button>
    );
  };

  const actions =
    !options.brew && !options.direct ? (
      <Button
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => void openUrl(LIBREOFFICE_DOWNLOADS)}
      >
        <IconExternalLink />
        Get LibreOffice
      </Button>
    ) : (
      <>
        <Button
          variant="linkMuted"
          size="sm"
          className="mr-auto gap-1.5 px-0"
          onClick={() => void openUrl(LIBREOFFICE_DOWNLOADS)}
        >
          Downloads Page
          <IconExternalLink />
        </Button>
        {options.direct && button("direct", "Download and Install", <IconDownload />)}
        {options.brew && options.direct && (
          <span className="text-xs text-muted-foreground">or</span>
        )}
        {options.brew && button("brew", "Install with Homebrew", <IconBeer />)}
      </>
    );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
      <section
        aria-label="Install LibreOffice"
        className="pointer-events-auto flex w-full max-w-xl flex-col gap-3 rounded-xl border border-border bg-popover p-3 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-caution/15 text-caution">
            <IconAlertTriangle size={16} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-medium">Install LibreOffice to preview this file here</p>
            <p className="text-xs text-muted-foreground">
              Slides, older Office files, OpenDocument and iWork files are shown through
              LibreOffice. Free and open source, converts on your device, no account needed.
            </p>
            {install.isError && (
              <p className="text-xs text-destructive" role="alert">
                {install.error.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      </section>
    </div>
  );
}
