import {
  IconAlertTriangle,
  IconFileDownload,
  IconFileText,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconMarkdown,
  IconRectangle,
  IconRectangleVertical,
} from "@tabler/icons-react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentType, useState } from "react";
import { StatusButtonContent, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { FormField } from "#/components/form-field.tsx";
import { Button } from "@nookly/ui/components/button";
import { Checkbox } from "@nookly/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { cn } from "@nookly/ui/lib/utils";
import { renderPageMarkdown } from "#/lib/api/notes.ts";
import type { Entity } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import {
  type ExportFormat,
  FORMAT_IDS,
  FORMATS,
  MARGIN_IDS,
  MARGINS,
  type PageExportOptions,
  PAGE_SIZE_IDS,
  PAGE_SIZES,
  TEXT_SIZE_IDS,
  TEXT_SIZES,
  loadOptions,
  saveOptions,
} from "./export-options.ts";
import { exportPage, loadExportDocument, renderDocument } from "./export-page.ts";
import { PdfPreview } from "./export-preview.tsx";

const FORMAT_ICONS = {
  pdf: IconFileTypePdf,
  docx: IconFileTypeDocx,
  odt: IconFileText,
  markdown: IconMarkdown,
} satisfies Record<ExportFormat, ComponentType<{ size?: number; className?: string }>>;

/// What makes the files and draws the preview. The app's own by default; a test passes a
/// stand in where pdf.js and the PDF fonts need a real browser.
export interface ExportRenderer {
  render: typeof renderDocument;
  Preview: ComponentType<{ bytes: Uint8Array }>;
}

const APP_RENDERER: ExportRenderer = { render: renderDocument, Preview: PdfPreview };

interface Choice<T extends string> {
  value: T;
  label: string;
}

const choicesOf = <T extends string>(ids: readonly T[], labels: Record<T, { label: string }>) =>
  ids.map((id): Choice<T> => ({ value: id, label: labels[id].label }));

const PAGE_SIZE_CHOICES = choicesOf(PAGE_SIZE_IDS, PAGE_SIZES);
const MARGIN_CHOICES = choicesOf(MARGIN_IDS, MARGINS);
const TEXT_SIZE_CHOICES = choicesOf(TEXT_SIZE_IDS, TEXT_SIZES);

/// The formats are few and each is a different file, so they're all in view to pick from,
/// not in a dropdown: the icon and extension say what comes out.
function FormatPicker({
  value,
  onChange,
}: {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Format" className="flex flex-col gap-1">
      {FORMAT_IDS.map((format) => {
        const Icon = FORMAT_ICONS[format];
        const selected = format === value;
        return (
          <button
            key={format}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(format)}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-md border px-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon size={16} className={selected ? "text-primary" : undefined} />
            <span className="min-w-0 flex-1 truncate">{FORMATS[format].label}</span>
            <span className="text-xs font-normal text-muted-foreground">
              .{FORMATS[format].extension}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function OptionSelect<T extends string>({
  id,
  label,
  value,
  choices,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <FormField label={label} htmlFor={id}>
      <Select
        value={value}
        onValueChange={(next) => {
          const choice = choices.find((c) => c.value === next);
          if (choice) onChange(choice.value);
        }}
      >
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

function OrientationPicker({
  landscape,
  onChange,
}: {
  landscape: boolean;
  onChange: (landscape: boolean) => void;
}) {
  const option = (value: boolean, label: string, Icon: typeof IconRectangle) => (
    <Button
      type="button"
      size="sm"
      variant={landscape === value ? "secondary" : "ghost"}
      role="radio"
      aria-checked={landscape === value}
      className="flex-1"
      onClick={() => onChange(value)}
    >
      <Icon size={14} />
      {label}
    </Button>
  );
  return (
    <div className="flex flex-col gap-1">
      <span id="export-orientation" className="text-xs leading-none text-muted-foreground">
        Orientation
      </span>
      <div role="radiogroup" aria-labelledby="export-orientation" className="flex gap-1">
        {option(false, "Portrait", IconRectangleVertical)}
        {option(true, "Landscape", IconRectangle)}
      </div>
    </div>
  );
}

function PreviewMessage({ pending, children }: { pending?: boolean; children: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      {pending ? (
        <StatusIcon status="pending" idle={null} />
      ) : (
        <IconAlertTriangle size={14} className="text-caution" />
      )}
      {children}
    </div>
  );
}

/// One place to export a page to a file: PDF, Word, OpenDocument or Markdown, with the
/// page as it will come out shown beside the options, like a print dialog.
export function ExportPageDialog({
  entity,
  open,
  onOpenChange,
  renderer = APP_RENDERER,
}: {
  entity: Entity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderer?: ExportRenderer;
}) {
  const queryClient = useQueryClient();
  const [options, setOptions] = useState(loadOptions);
  const update = (patch: Partial<PageExportOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    saveOptions(next);
  };
  const isDocument = options.format !== "markdown";

  const documentQuery = {
    queryKey: qk.pageExport(entity.id),
    queryFn: () => loadExportDocument(entity),
    staleTime: 0,
    gcTime: 0,
  };
  const doc = useQuery({ ...documentQuery, enabled: open });
  // Every document format previews as the PDF: they share one layout.
  const { format: _, ...layout } = options;
  const preview = useQuery({
    queryKey: qk.pageExportPreview(entity.id, JSON.stringify({ layout, at: doc.dataUpdatedAt })),
    queryFn: () => (doc.data ? renderer.render(doc.data, "pdf", options) : null),
    enabled: open && isDocument && doc.data !== undefined,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 0,
  });
  const markdown = useQuery({
    queryKey: qk.pageMarkdown(entity.id),
    queryFn: () => renderPageMarkdown(entity.id),
    enabled: open && !isDocument,
    staleTime: 0,
  });

  const run = useMutation({
    mutationFn: () =>
      exportPage(
        entity,
        options,
        async () => doc.data ?? queryClient.fetchQuery(documentQuery),
        renderer.render,
      ),
    onSuccess: (saved) => {
      if (saved) onOpenChange(false);
      else run.reset();
    },
  });
  const status = statusOf(run);

  const previewPane = isDocument ? (
    preview.data ? (
      <renderer.Preview bytes={preview.data} />
    ) : doc.isError || preview.isError ? (
      <PreviewMessage>Couldn't draw the preview</PreviewMessage>
    ) : (
      <PreviewMessage pending>Preparing preview</PreviewMessage>
    )
  ) : markdown.data !== undefined ? (
    <pre className="min-h-full rounded-sm bg-background p-4 font-mono text-xs whitespace-pre-wrap text-foreground shadow-sm ring-1 ring-border">
      {markdown.data}
    </pre>
  ) : markdown.isError ? (
    <PreviewMessage>Couldn't draw the preview</PreviewMessage>
  ) : (
    <PreviewMessage pending>Preparing preview</PreviewMessage>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A dialog stays open while its action runs.
        if (!run.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="h-[min(720px,calc(100vh-4rem))] max-w-[min(960px,calc(100vw-2rem))] grid-rows-1 gap-0 overflow-hidden p-0 sm:grid-cols-[1fr_296px]">
        <section
          aria-label="Preview"
          className="hidden min-h-0 overflow-y-auto bg-muted/60 p-6 sm:block"
        >
          {previewPane}
        </section>
        <div className="flex min-h-0 flex-col border-l">
          <div className="flex flex-col gap-1 px-4 pt-4 pb-3">
            <DialogTitle className="text-base">Export Page</DialogTitle>
            <DialogDescription className="text-xs">
              Save the page as a file to print, share or open in another app.
            </DialogDescription>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <FormatPicker value={options.format} onChange={(format) => update({ format })} />
            {isDocument ? (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="export-include-title"
                    checked={options.includeTitle}
                    onCheckedChange={(checked) => update({ includeTitle: checked === true })}
                  />
                  <label htmlFor="export-include-title" className="text-sm">
                    Include the title as a heading
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <OptionSelect
                    id="export-page-size"
                    label="Page size"
                    value={options.pageSize}
                    choices={PAGE_SIZE_CHOICES}
                    onChange={(pageSize) => update({ pageSize })}
                  />
                  <OptionSelect
                    id="export-margins"
                    label="Margins"
                    value={options.margins}
                    choices={MARGIN_CHOICES}
                    onChange={(margins) => update({ margins })}
                  />
                </div>
                <OrientationPicker
                  landscape={options.landscape}
                  onChange={(landscape) => update({ landscape })}
                />
                <OptionSelect
                  id="export-text-size"
                  label="Text size"
                  value={options.textSize}
                  choices={TEXT_SIZE_CHOICES}
                  onChange={(textSize) => update({ textSize })}
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Markdown keeps the page as plain text, for reading in any editor. Custom blocks
                become text figures.
              </p>
            )}
          </div>
          <div className="border-t px-4 py-3">
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={run.isPending} onClick={() => run.mutate()}>
                <StatusButtonContent
                  status={status}
                  icon={<IconFileDownload size={14} />}
                  label={`Export ${FORMATS[options.format].label}`}
                  errorLabel="Couldn't export, try again"
                />
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
