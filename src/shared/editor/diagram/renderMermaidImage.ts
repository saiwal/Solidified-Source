/**
 * renderMermaidImage.ts
 * Mermaid source → SVG (preview) or PNG File (upload), for the composer's
 * diagram modal. Counterpart of latex/renderLatexImage.ts: federated content
 * gets an ordinary hosted image, since remote hubs and ActivityPub readers
 * won't run mermaid.
 */
import { loadMermaid } from "@utsukta/spa-core/lib/hydrateMermaid";

export class DiagramRenderError extends Error {}

// Per-render overrides as a directive, so the shared mermaid instance's
// global config (theme follows the reader's dark mode, set by
// hydrateMermaid) is left alone. The export is always light-on-white, and
// SVG <text> labels instead of HTML in a <foreignObject> rasterize reliably.
const EXPORT_DIRECTIVE =
  '%%{init: {"theme": "default", "htmlLabels": false, "flowchart": {"htmlLabels": false}}}%%\n';

let seq = 0;

/**
 * Strips a wrapper pasted along with the diagram — a ```mermaid fence or a
 * [code=mermaid] block — so the modal takes either form. Mermaid itself
 * rejects both ("No diagram type detected").
 */
export function unwrapDiagram(source: string): string {
  const s = source.trim();
  const m =
    /^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?\1$/.exec(s) ??
    /^\[code(?:=mermaid)?\]([\s\S]*?)\[\/code\]$/i.exec(s);
  return m ? (m[2] ?? m[1]).trim() : s;
}

/**
 * Renders `source` to an SVG string; throws DiagramRenderError on bad syntax.
 * Always the export look, so the modal's (white) preview is the image that
 * will be uploaded, whatever theme the author is using.
 */
export async function renderMermaidSvg(source: string): Promise<string> {
  const mermaid = await loadMermaid();
  const text = source.trim();
  if (!text) throw new DiagramRenderError("Enter a diagram first.");
  try {
    // Throws on a syntax error instead of drawing mermaid's error graphic.
    await mermaid.parse(text);
    const { svg } = await mermaid.render(`spa-diagram-${++seq}`, EXPORT_DIRECTIVE + text);
    return svg;
  } catch (err) {
    throw new DiagramRenderError(err instanceof Error ? err.message : String(err));
  }
}

/** First word of the source — "flowchart", "sequenceDiagram", "pie"… — for alt text. */
export function diagramKind(source: string): string {
  const line = source.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("%%")) ?? "";
  return line.split(/\s+/)[0] ?? "";
}

/**
 * Renders `source` to a PNG File at `scale`x for retina sharpness. `width` is
 * the un-scaled size the inserted [img] should display at.
 */
export async function renderMermaidToPngFile(
  source: string,
  scale = 2,
): Promise<{ file: File; width: number; height: number }> {
  const svgText = await renderMermaidSvg(source);

  // mermaid emits width="100%" + a viewBox; an <img> needs real dimensions.
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svgEl = doc.documentElement;
  const vb = (svgEl.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const width = Math.max(1, Math.ceil(vb[2] || 0));
  const height = Math.max(1, Math.ceil(vb[3] || 0));
  if (width <= 1 || height <= 1) throw new DiagramRenderError("Could not measure the diagram.");
  svgEl.setAttribute("width", String(width));
  svgEl.setAttribute("height", String(height));
  svgEl.removeAttribute("style"); // drops mermaid's max-width
  const svg = new XMLSerializer().serializeToString(svgEl);

  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new DiagramRenderError("Could not rasterize the diagram."));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new DiagramRenderError("Canvas is unavailable in this browser.");
    // mermaid's SVG background is transparent; dark-themed readers would get
    // black lines on their dark page.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let blob: Blob | null;
    try {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } catch {
      // A tainted canvas (an SVG feature the browser won't rasterize safely).
      blob = null;
    }
    if (!blob) throw new DiagramRenderError("Could not export the rendered diagram.");
    return { file: new File([blob], `diagram-${Date.now()}.png`, { type: "image/png" }), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
