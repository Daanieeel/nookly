import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { IconWand } from "@tabler/icons-react";
import { memo, useState } from "react";
import { CopyButton } from "@nookly/ui/components/copy-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { notify } from "#/components/notify.tsx";
import { resolveLanguageEntry } from "./code-languages";
import { canFormat } from "./format-code";
import { formatCodeBlock } from "./format-code-block";
import { asString, type JSONAttrValue } from "./block-markdown";
import { CodeBlockLanguagePicker } from "./CodeBlockLanguagePicker";

/// Header row (filename + language) for a `codeBlock` node — plain `CodeBlockLowlight`
/// only renders `<pre><code>`, so this NodeView adds the chrome around it. Both the
/// header and the `pre` body use tokens distinct from the editor's own page background
/// (`--accent` / `--card` vs `--background`) so the block reads as a raised surface.
export function CodeBlockComponent({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  // SAFETY: `CodeBlockWithHeader`'s attribute defs only ever write `language` as `string | null`,
  // a subset of `JSONAttrValue` — the shape `asString` parses.
  const language = asString(node.attrs.language as JSONAttrValue | undefined) ?? null;
  // SAFETY: same attribute defs only ever write `filename` as `string | null`, also a subset
  // of `JSONAttrValue`.
  const filename = asString(node.attrs.filename as JSONAttrValue | undefined) ?? "";
  // The copy button only exists while the pointer is over the block, so a page of
  // code blocks doesn't mount a tooltip per block up front.
  const [hovered, setHovered] = useState(false);

  const format = async () => {
    const pos = getPos();
    if (pos === undefined) return;
    const result = await formatCodeBlock(editor, pos);
    if (result === "failed") {
      notify.error("Couldn't format the code", {
        description: "It has a syntax error, so it was left as it is.",
      });
    } else if (result === "unchanged") {
      notify.info("Already formatted");
    }
  };

  return (
    <NodeViewWrapper
      className="code-block-wrapper my-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CodeBlockHeader
        language={language}
        filename={filename}
        updateAttributes={updateAttributes}
        editable={editor.isEditable}
        onFormat={format}
      />
      {/* The copy button anchors to this zero height box, not to the <pre>, which must not be
          positioned (see `pre.code-block-body` in `styles.css`). */}
      {hovered && (
        <div className="relative h-0" contentEditable={false}>
          <div className="absolute right-2 top-2 z-10 animate-in fade-in-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <CopyButton
                  value={node.textContent}
                  aria-label="Copy code"
                  className="flex items-center justify-center rounded-md border border-border bg-card p-1.5 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
                />
              </TooltipTrigger>
              <TooltipContent>Copy code</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
      <pre className="code-block-body">
        <NodeViewContent<"div"> as="div" />
      </pre>
    </NodeViewWrapper>
  );
}

/// Memoized so typing inside the block (a new `node` on every keystroke) doesn't
/// re-render the filename input and language picker.
const CodeBlockHeader = memo(function CodeBlockHeader({
  language,
  filename,
  updateAttributes,
  editable,
  onFormat,
}: {
  language: string | null;
  filename: string;
  updateAttributes: ReactNodeViewProps["updateAttributes"];
  editable: boolean;
  onFormat: () => void;
}) {
  return (
    <div className="code-block-header" contentEditable={false}>
      <input
        value={filename}
        onChange={(event) => updateAttributes({ filename: event.target.value || null })}
        placeholder="Untitled"
        spellCheck={false}
        className="code-block-filename"
      />
      {editable && <FormatButton language={language} onFormat={onFormat} />}
      <CodeBlockLanguagePicker
        value={language}
        onChange={(next) => updateAttributes({ language: next })}
      />
    </div>
  );
});

/// Tidies the block's code with the formatter for its language. Off, saying why, where there is
/// none; a disabled button gets no pointer events, so the tooltip hangs off a wrapper.
function FormatButton({ language, onFormat }: { language: string | null; onFormat: () => void }) {
  const available = canFormat(language);
  const name = resolveLanguageEntry(language)?.label ?? "this language";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex">
          <button
            type="button"
            aria-label="Format code"
            disabled={!available}
            onClick={onFormat}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground disabled:opacity-40"
          >
            <IconWand size={14} />
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{available ? "Format code" : `No formatter for ${name}`}</TooltipContent>
    </Tooltip>
  );
}
