import type { HLJSApi, Language, LanguageFn, Mode } from "highlight.js";

/// highlight.js's javascript/typescript grammar recognizes a JSX Fragment (`<>...</>`) as a
/// top-level return value, but the recursive rule it uses to walk *nested* tags — the one that
/// finds where an outer tag's own matching close actually is — only knows `<Tag>...</Tag>`
/// pairs (a `skip: true`, `contains: ['self']` mode keyed off a tag-name regex that requires at
/// least one identifier character between the brackets). A fragment nested inside a real tag's
/// children — `<div><>...</></div>` — doesn't match that regex, so the outer `<div>...</div>`
/// region is measured wrong: it ends right after the fragment, and everything past that point,
/// including the real `</div>`, falls back to unhighlighted plain text. Reproduced against the
/// raw `javascript` grammar before this fix existed; see `lowlight.ts` for where it's applied.
///
/// This patches that boundary-finding rule only — it does NOT make the embedded `xml`
/// sub-language itself understand `<>`/`</>` (real XML/HTML has no anonymous-tag syntax, and
/// patching that grammar too is out of scope here). So a fragment's own inner content (e.g. the
/// `<span>` between a `<>` and its `</>`) still renders unstyled — but that's now the full
/// extent of the damage, instead of it cascading to every sibling and closing tag that follows.
///
/// Patches the grammar object in place after highlight.js builds it: finds that recursive rule
/// structurally (by shape, not object identity — it isn't exported) and gives it a fragment
/// variant alongside its original tag-pair one.
export function withJsxFragmentSupport(languageFn: LanguageFn): LanguageFn {
  return (hljs: HLJSApi): Language => {
    const language = languageFn(hljs);
    const patched = patchNode(language, new Map());
    // SAFETY: `patchNode` only ever changes a node's own `contains`/`variants`/`starts`
    // arrays (via a shallow clone, see below) — every other field, including all of
    // `Language`'s own (name, aliases, keywords, ...), passes through untouched, so the
    // result still satisfies `Language`.
    return patched as Language;
  };
}

type PatchableNode = {
  contains?: (Mode | "self")[];
  variants?: Mode[];
  starts?: Mode;
};

function isMode(child: Mode | "self"): child is Mode {
  return typeof child !== "string";
}

function isRecursiveJsxTagMode(child: Mode | "self"): child is Mode {
  return (
    isMode(child) &&
    child.skip === true &&
    Array.isArray(child.contains) &&
    child.contains.length === 1 &&
    child.contains[0] === "self" &&
    child.begin !== undefined &&
    child.end !== undefined
  );
}

/// Pure (never mutates its input) — several of highlight.js's own exported constants (shared,
/// e.g. across the javascript/typescript grammars) are frozen, and mutating `.contains` in
/// place threw "Attempted to assign to readonly property" the moment one of those was reached.
/// Only nodes on the path down to an actual JSX-mode match get shallow-cloned; everything else
/// is returned by the same reference it came in as.
function patchNode<T extends PatchableNode>(node: T, cache: Map<PatchableNode, PatchableNode>): T {
  const cached = cache.get(node);
  if (cached) {
    // SAFETY: every value this cache ever holds was produced by patching some `T` (either the
    // node itself, unchanged, or a `{ ...node }` clone of it) — cache lookups always key off
    // the exact `T` that produced that entry, so the value back is that same `T`'s shape.
    return cached as T;
  }

  const result: PatchableNode = { ...node };
  cache.set(node, result);
  let changed = false;

  if (node.contains) {
    const patchedContains = node.contains.map((child) => {
      if (isRecursiveJsxTagMode(child)) {
        changed = true;
        return { variants: [{ begin: "<>", end: "</>" }, child] };
      }
      if (!isMode(child)) return child;
      const patchedChild = patchNode(child, cache);
      if (patchedChild !== child) changed = true;
      return patchedChild;
    });
    result.contains = patchedContains;
  }
  if (node.variants) {
    const patchedVariants = node.variants.map((variant) => patchNode(variant, cache));
    if (patchedVariants.some((variant, i) => variant !== node.variants?.[i])) {
      result.variants = patchedVariants;
      changed = true;
    }
  }
  if (node.starts) {
    const patchedStarts = patchNode(node.starts, cache);
    if (patchedStarts !== node.starts) {
      result.starts = patchedStarts;
      changed = true;
    }
  }
  // SAFETY: `result` started as `{ ...node }` (every field `T` has, copied) and only ever had
  // its `contains`/`variants`/`starts` replaced with patched versions of the same shape — so it
  // still satisfies `T` whether or not `changed` ended up true.
  return (changed ? result : node) as T;
}
