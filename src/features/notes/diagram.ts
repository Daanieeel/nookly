/// Mermaid rendering for the diagram block. Mermaid is large, so it loads the
/// first time a diagram is shown rather than with the editor.
let mermaidModule: Promise<typeof import("mermaid")> | null = null;
let renderCount = 0;
/// Mermaid keeps one global config, so renders run one at a time, each with
/// the theme it needs.
let queue: Promise<unknown> = Promise.resolve();

export function renderDiagram(
  source: string,
  element: HTMLElement,
  dark: boolean,
): Promise<string | null> {
  const run = async () => {
    mermaidModule ??= import("mermaid");
    const { default: mermaid } = await mermaidModule;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "neutral",
      fontFamily: getComputedStyle(document.body).fontFamily,
    });
    try {
      const { svg, bindFunctions } = await mermaid.render(
        `nookly-diagram-${++renderCount}`,
        source,
      );
      element.innerHTML = svg;
      bindFunctions?.(element);
      return null;
    } catch (error) {
      element.innerHTML = "";
      return error instanceof Error ? error.message : String(error);
    }
  };
  const result = queue.then(run, run);
  queue = result;
  return result;
}
