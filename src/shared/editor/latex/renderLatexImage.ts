/**
 * renderLatexImage.ts
 * Renders a LaTeX expression into a self-contained SVG data URI so it can be
 * dropped into a post body as a plain [img] tag — no client-side math
 * renderer required to view it later, on this site or a remote one.
 *
 * KaTeX draws layout (fractions, roots, sub/superscripts, delimiter sizing)
 * with plain CSS, but glyphs (variables, operators, symbols) come from its
 * own webfonts. To make the exported image render identically everywhere,
 * the KaTeX stylesheet and the *subset* of KaTeX fonts this expression
 * actually uses are inlined into the SVG as base64 @font-face rules.
 */
import katex from "katex";
import katexCss from "katex/dist/katex.min.css?raw";
import "katex/dist/katex.min.css";

import AMS_Regular from "katex/dist/fonts/KaTeX_AMS-Regular.woff2?url";
import Caligraphic_Bold from "katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?url";
import Caligraphic_Regular from "katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?url";
import Fraktur_Bold from "katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?url";
import Fraktur_Regular from "katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?url";
import Main_Bold from "katex/dist/fonts/KaTeX_Main-Bold.woff2?url";
import Main_BoldItalic from "katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?url";
import Main_Italic from "katex/dist/fonts/KaTeX_Main-Italic.woff2?url";
import Main_Regular from "katex/dist/fonts/KaTeX_Main-Regular.woff2?url";
import Math_BoldItalic from "katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?url";
import Math_Italic from "katex/dist/fonts/KaTeX_Math-Italic.woff2?url";
import SansSerif_Bold from "katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?url";
import SansSerif_Italic from "katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?url";
import SansSerif_Regular from "katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?url";
import Script_Regular from "katex/dist/fonts/KaTeX_Script-Regular.woff2?url";
import Size1_Regular from "katex/dist/fonts/KaTeX_Size1-Regular.woff2?url";
import Size2_Regular from "katex/dist/fonts/KaTeX_Size2-Regular.woff2?url";
import Size3_Regular from "katex/dist/fonts/KaTeX_Size3-Regular.woff2?url";
import Size4_Regular from "katex/dist/fonts/KaTeX_Size4-Regular.woff2?url";
import Typewriter_Regular from "katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?url";

const FONT_URLS: Record<string, string> = {
  "KaTeX_AMS-Regular": AMS_Regular,
  "KaTeX_Caligraphic-Bold": Caligraphic_Bold,
  "KaTeX_Caligraphic-Regular": Caligraphic_Regular,
  "KaTeX_Fraktur-Bold": Fraktur_Bold,
  "KaTeX_Fraktur-Regular": Fraktur_Regular,
  "KaTeX_Main-Bold": Main_Bold,
  "KaTeX_Main-BoldItalic": Main_BoldItalic,
  "KaTeX_Main-Italic": Main_Italic,
  "KaTeX_Main-Regular": Main_Regular,
  "KaTeX_Math-BoldItalic": Math_BoldItalic,
  "KaTeX_Math-Italic": Math_Italic,
  "KaTeX_SansSerif-Bold": SansSerif_Bold,
  "KaTeX_SansSerif-Italic": SansSerif_Italic,
  "KaTeX_SansSerif-Regular": SansSerif_Regular,
  "KaTeX_Script-Regular": Script_Regular,
  "KaTeX_Size1-Regular": Size1_Regular,
  "KaTeX_Size2-Regular": Size2_Regular,
  "KaTeX_Size3-Regular": Size3_Regular,
  "KaTeX_Size4-Regular": Size4_Regular,
  "KaTeX_Typewriter-Regular": Typewriter_Regular,
};

// Always shipped — the base font plus the italic math-variable font used by
// almost every non-trivial expression (x, y, \alpha, …) and the delimiter
// fonts used for anything beyond the smallest parens/brackets.
const CORE_FONTS = [
  "KaTeX_Main-Regular",
  "KaTeX_Main-Italic",
  "KaTeX_Math-Italic",
  "KaTeX_Size1-Regular",
  "KaTeX_Size2-Regular",
];

// class-name substring -> extra font files it pulls in. Checked against the
// rendered HTML so an expression only pays for fonts it actually used.
const FONT_MARKERS: [string, string[]][] = [
  ["mathbf", ["KaTeX_Main-Bold"]],
  ["boldsymbol", ["KaTeX_Math-BoldItalic"]],
  ["mathbb", ["KaTeX_AMS-Regular"]],
  ["textbb", ["KaTeX_AMS-Regular"]],
  ["amsrm", ["KaTeX_AMS-Regular"]],
  ["mathcal", ["KaTeX_Caligraphic-Regular"]],
  ["mathboldfrak", ["KaTeX_Fraktur-Bold"]],
  ["textboldfrak", ["KaTeX_Fraktur-Bold"]],
  ["mathfrak", ["KaTeX_Fraktur-Regular"]],
  ["textfrak", ["KaTeX_Fraktur-Regular"]],
  ["mathscr", ["KaTeX_Script-Regular"]],
  ["textscr", ["KaTeX_Script-Regular"]],
  ["mathboldsf", ["KaTeX_SansSerif-Bold"]],
  ["textboldsf", ["KaTeX_SansSerif-Bold"]],
  ["mathitsf", ["KaTeX_SansSerif-Italic"]],
  ["mathsfit", ["KaTeX_SansSerif-Italic"]],
  ["textitsf", ["KaTeX_SansSerif-Italic"]],
  ["mathsf", ["KaTeX_SansSerif-Regular"]],
  ["textsf", ["KaTeX_SansSerif-Regular"]],
  ["mathtt", ["KaTeX_Typewriter-Regular"]],
  ["texttt", ["KaTeX_Typewriter-Regular"]],
  ["small-op", ["KaTeX_Size1-Regular"]],
  ["large-op", ["KaTeX_Size2-Regular"]],
  ["delimsizing size3", ["KaTeX_Size3-Regular"]],
  ["delimsizing size4", ["KaTeX_Size4-Regular"]],
  ["delim-size4", ["KaTeX_Size4-Regular"]],
];

function neededFonts(html: string): Set<string> {
  const set = new Set<string>(CORE_FONTS);
  for (const [marker, files] of FONT_MARKERS) {
    if (html.includes(marker)) files.forEach((f) => set.add(f));
  }
  return set;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const fontDataUriCache = new Map<string, Promise<string>>();

function fontDataUri(key: string): Promise<string> {
  let cached = fontDataUriCache.get(key);
  if (!cached) {
    cached = fetch(FONT_URLS[key])
      .then((res) => res.arrayBuffer())
      .then((buf) => `data:font/woff2;base64,${arrayBufferToBase64(buf)}`);
    fontDataUriCache.set(key, cached);
  }
  return cached;
}

export class LatexRenderError extends Error {}

/** Renders `source` and reports errors without throwing — for live preview. */
export function renderLatexPreview(
  el: HTMLElement,
  source: string,
  displayMode: boolean,
): void {
  try {
    katex.render(source, el, { displayMode, throwOnError: true, output: "html" });
  } catch (err) {
    el.textContent = err instanceof Error ? err.message : String(err);
    el.classList.add("text-danger-txt");
    return;
  }
  el.classList.remove("text-danger-txt");
}

interface BuiltSvg {
  svg: string;
  width: number;
  height: number;
}

async function buildSvg(source: string, displayMode: boolean): Promise<BuiltSvg> {
  const trimmed = source.trim();
  if (!trimmed) throw new LatexRenderError("Enter a LaTeX expression first.");

  let html: string;
  try {
    html = katex.renderToString(trimmed, {
      displayMode,
      throwOnError: true,
      output: "html",
    });
  } catch (err) {
    throw new LatexRenderError(err instanceof Error ? err.message : String(err));
  }

  const fontSize = displayMode ? 32 : 22;
  const padding = displayMode ? 12 : 4;

  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* not fatal — measure anyway */ }
  }

  const host = document.createElement("div");
  host.style.cssText =
    `position:fixed;left:-99999px;top:0;visibility:hidden;` +
    `font-size:${fontSize}px;color:#000;display:inline-block;` +
    `padding:${padding}px;white-space:nowrap;`;
  host.innerHTML = html;
  document.body.appendChild(host);
  const rect = host.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));
  document.body.removeChild(host);

  const needed = neededFonts(html);
  const faceRules = await Promise.all(
    Array.from(needed).map(async (key) => {
      const uri = await fontDataUri(key);
      const family = key.slice(0, key.lastIndexOf("-"));
      const style = key.includes("Italic") ? "italic" : "normal";
      const weight = key.includes("Bold") ? 700 : 400;
      return `@font-face{font-family:${family};font-style:${style};font-weight:${weight};src:url(${uri}) format("woff2");}`;
    }),
  );

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${fontSize}px;color:#000;` +
    `padding:${padding}px;box-sizing:border-box;display:inline-block;white-space:nowrap;">` +
    `<style>${katexCss}${faceRules.join("")}</style>` +
    html +
    `</div></foreignObject></svg>`;

  return { svg, width, height };
}

/**
 * Renders `source` to a PNG File, ready to upload as a normal photo.
 *
 * A raw SVG (even a self-contained one) is unreliable across federation:
 * many remote ActivityPub receivers and image proxies reject or strip
 * `data:` URIs and inline SVG. Rasterizing to PNG and uploading it through
 * the normal photo pipeline (wall_attach) gives every reader — local or
 * remote — an ordinary hosted image URL.
 */
export async function renderLatexToPngFile(
  source: string,
  displayMode: boolean,
  scale = 3,
): Promise<{ file: File; width: number; height: number }> {
  const { svg, width, height } = await buildSvg(source, displayMode);

  const svgBlob = new Blob([svg], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new LatexRenderError("Could not rasterize the equation."));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new LatexRenderError("Canvas is unavailable in this browser.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new LatexRenderError("Could not export the rendered equation.");
    // width/height are the un-scaled CSS-pixel dimensions the SVG was
    // measured at — the canvas raster is `scale`x that for retina sharpness,
    // so callers must constrain the inserted <img> to these to display it at
    // the intended inline size instead of the raw (3x) pixel size.
    return { file: new File([blob], `latex-${Date.now()}.png`, { type: "image/png" }), width, height };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
