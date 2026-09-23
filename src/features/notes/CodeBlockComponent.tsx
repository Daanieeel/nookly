import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { memo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { asString, type JSONAttrValue } from "./block-markdown";
import { CodeBlockLanguagePicker } from "./CodeBlockLanguagePicker";

/// Header row (filename + language) for a `codeBlock` node — plain `CodeBlockLowlight`
/// only renders `<pre><code>`, so this NodeView adds the chrome around it. Both the
/// header and the `pre` body use tokens distinct from the editor's own page background
/// (`--accent` / `--card` vs `--background`) so the block reads as a raised surface.
export function CodeBlockComponent({ node, updateAttributes }: ReactNodeViewProps) {
  // SAFETY: `CodeBlockWithHeader`'s attribute defs only ever write `language` as `string | null`,
  // a subset of `JSONAttrValue` — the shape `asString` parses.
  const language = asString(node.attrs.language as JSONAttrValue | undefined) ?? null;
  // SAFETY: same attribute defs only ever write `filename` as `string | null`, also a subset
  // of `JSONAttrValue`.
  const filename = asString(node.attrs.filename as JSONAttrValue | undefined) ?? "";
  // The copy button only exists while the pointer is over the block, so a page of
  // code blocks doesn't mount a tooltip per block up front.
  const [hovered, setHovered] = useState(false);

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
      />
      <pre className="code-block-body">
        <NodeViewContent<"code"> as="code" />
        {hovered && (
          <div className="absolute right-2 top-2 animate-in fade-in-0" contentEditable={false}>
            <Tooltip>
              <TooltipTrigger asChild>
                <CopyButton
                  value={node.textContent}
                  className="flex items-center justify-center rounded-md border border-border bg-card p-1.5 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
                />
              </TooltipTrigger>
              <TooltipContent>Copy code</TooltipContent>
            </Tooltip>
          </div>
        )}
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
}: {
  language: string | null;
  filename: string;
  updateAttributes: ReactNodeViewProps["updateAttributes"];
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
      <CodeBlockLanguagePicker
        value={language}
        onChange={(next) => updateAttributes({ language: next })}
      />
    </div>
  );
});
