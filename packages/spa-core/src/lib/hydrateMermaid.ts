/**
 * hydrateMermaid.ts
 * Renders ```mermaid fenced blocks (markdown) and [code=mermaid] (bbcode) in
 * already-rendered HTML into diagrams, in place. Both formats emit the same
 * <pre><code class="language-mermaid">, so one selector covers them, and a
 * reader on another hub just sees the source as a code block.
 *
 * Same shape as hydrateLatex.ts: mermaid is only imported the first time a
 * page actually contains a diagram. Its chunks are already excluded from the
 * SW precache (build-sw.mjs globIgnores) since Excalidraw pulls them in too.
 */

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      // Bodies arrive from federated peers: "strict" keeps mermaid's own
      // sanitiser on and disables click callbacks / raw HTML labels.
      securityLevel: "strict",
      // ponytail: theme picked once at first load; diagrams already on screen
      // don't recolour on a theme switch — re-render on change if that matters.
      theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
    });
    return mermaid;
  });
  return mermaidPromise;
}

/** Replaces every mermaid code block under `root` with a rendered diagram. */
export function hydrateMermaid(root: HTMLElement): void {
  // Wiki markdown is rendered server-side by MarkdownExtra, whose
  // code_class_prefix is "" — it emits class="mermaid", not language-mermaid.
  const blocks = root.querySelectorAll<HTMLElement>("pre > code.language-mermaid, pre > code.mermaid");
  if (!blocks.length) return;

  void loadMermaid().then((mermaid) => {
    const nodes: HTMLElement[] = [];
    for (const code of blocks) {
      const pre = code.parentElement;
      // Re-rendered (or already hydrated) while mermaid was loading.
      if (!pre?.isConnected) continue;
      const div = document.createElement("div");
      div.className = "mermaid";
      // bbcode.ts turns indentation into &nbsp; even inside [code]; mermaid's
      // lexer wants real spaces.
      div.textContent = (code.textContent ?? "").replace(/ /g, " ");
      pre.replaceWith(div);
      nodes.push(div);
    }
    // A syntax error leaves mermaid's error graphic in that block only.
    if (nodes.length) void mermaid.run({ nodes, suppressErrors: true });
  });
}
