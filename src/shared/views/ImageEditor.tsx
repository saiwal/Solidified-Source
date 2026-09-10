import { onCleanup, onMount, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import FilerobotImageEditor from "filerobot-image-editor";
import { TABS, TOOLS } from "react-filerobot-image-editor";

// input.utils.js in @scaleflex/ui hardcodes lightPalette for input bg/text/border,
// completely bypassing the theme object. Inject CSS overrides using the stable
// Sfx* class names that generateClassNames() always produces.
function injectInputOverrides(): HTMLStyleElement {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();

  const bg     = v("--color-elevated");
  const bgFocus = v("--color-surface");
  const txt    = v("--color-txt");
  const subtle = v("--color-subtle");
  const rim    = v("--color-rim");
  const accent = v("--color-accent");

  const style = document.createElement("style");
  style.textContent = `
    .SfxInput-root {
      background-color: ${bg} !important;
      color: ${txt} !important;
      border-color: ${rim} !important;
    }
    .SfxInput-root:hover {
      background-color: ${bg} !important;
      color: ${txt} !important;
      border-color: ${rim} !important;
    }
    .SfxInput-root:focus-within {
      background-color: ${bgFocus} !important;
      color: ${txt} !important;
      border-color: ${accent} !important;
    }
    .SfxInput-Base {
      color: ${txt} !important;
    }
    .SfxInput-Base::placeholder {
      color: ${subtle} !important;
    }
  `;
  document.head.appendChild(style);
  return style;
}

function buildTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();

  const surface   = v("--color-surface");
  const elevated  = v("--color-elevated");
  const base      = v("--color-base");
  const txt       = v("--color-txt");
  const muted     = v("--color-muted");
  const subtle    = v("--color-subtle");
  const rim       = v("--color-rim");
  const rimStrong = v("--color-rim-strong");
  const accent    = v("--color-accent");
  const accentFg  = v("--color-accent-fg");

  return {
    palette: {
      "txt-primary":            txt,
      "txt-secondary":          muted,
      "txt-secondary-invert":   surface,
      "txt-placeholder":        subtle,
      "accent-primary":         accent,
      "accent-primary-hover":   accent,
      "accent-primary-active":  accent,
      "accent-primary-disabled": muted,
      "accent-stateless":       accent,
      "bg-primary":             surface,
      "bg-primary-light":       elevated,
      "bg-primary-hover":       elevated,
      "bg-primary-active":      elevated,
      "bg-primary-stateless":   elevated,
      "bg-secondary":           elevated,
      "bg-grey":                elevated,
      "bg-base-light":          base,
      "bg-base-medium":         base,
      "bg-stateless":           elevated,
      "bg-hover":               elevated,
      "bg-active":              elevated,
      "bg-tooltip":             elevated,
      "icon-primary":           txt,
      "icons-secondary":        muted,
      "icons-placeholder":      subtle,
      "icons-muted":            subtle,
      "icons-invert":           surface,
      "icons-primary-hover":    txt,
      "icons-secondary-hover":  muted,
      "btn-primary-text":       accentFg,
      "btn-primary-text-0-6":   accentFg,
      "btn-primary-text-0-4":   accentFg,
      "btn-disabled-text":      subtle,
      "btn-secondary-text":     txt,
      "link-primary":           accent,
      "link-stateless":         accent,
      "link-hover":             accent,
      "link-active":            accent,
      "link-muted":             muted,
      "borders-primary":        rim,
      "borders-primary-hover":  rimStrong,
      "borders-secondary":      rim,
      "borders-strong":         rimStrong,
      "borders-button":         rim,
      "borders-item":           rim,
      "borders-base-light":     rim,
      "borders-base-medium":    rimStrong,
      "borders-disabled":       rim,
      "border-hover-bottom":    accent,
      "border-active-bottom":   accent,
    } as Record<string, string>,
  };
}

export interface ImageEditorProps {
  file: File;
  /** width / height ratio — omit for free crop */
  aspect?: number;
  /** hint for which preset to show in the Crop tool */
  circular?: boolean;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
  /** when given, shows a "Use original" button that skips cropping entirely */
  onSkip?: () => void;
}

// Filerobot bakes edits onto a canvas sized to fit the on-screen editor
// (see DesignLayer.cache() in the library), then scales that bitmap back up
// to the source's native resolution on save — so its own export is capped by
// whatever fits your browser window, not the source photo's real detail.
// For a plain crop (no rotate/flip/filter/finetune/annotation/explicit resize)
// we can do better: redo the crop ourselves straight from the untouched
// source file at full resolution, using the crop rect Filerobot reports
// mapped from "shown" (on-screen) coordinates back to native pixels.
async function cropFromSource(
  objectUrl: string,
  crop: { x?: number; y?: number; width?: number; height?: number },
  shown: { width: number; height: number },
): Promise<Blob | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image load failed"));
    el.src = objectUrl;
  }).catch(() => null);
  if (!img || !shown.width || !shown.height) return null;

  const scaleX = img.naturalWidth / shown.width;
  const scaleY = img.naturalHeight / shown.height;
  const sx = Math.round((crop.x ?? 0) * scaleX);
  const sy = Math.round((crop.y ?? 0) * scaleY);
  const sw = Math.round((crop.width ?? shown.width) * scaleX);
  const sh = Math.round((crop.height ?? shown.height) * scaleY);
  if (sw <= 0 || sh <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

export default function ImageEditor(props: ImageEditorProps) {
  const { t } = useI18n();
  let container!: HTMLDivElement;
  let skipButton: HTMLButtonElement | undefined;
  let skipHome: HTMLElement | null = null;
  let editor: InstanceType<typeof FilerobotImageEditor> | null = null;
  let objectUrl = "";
  let inputOverrideStyle: HTMLStyleElement | null = null;

  onMount(() => {
    objectUrl = URL.createObjectURL(props.file);
    inputOverrideStyle = injectInputOverrides();

    const cropConfig: Record<string, unknown> = { autoResize: false };
    if (props.aspect !== undefined) {
      const isCover = props.aspect > 1.5;
      cropConfig.ratio = props.aspect;
      cropConfig.noPresets = false;
      cropConfig.presetsItems = [{
        titleKey:       isCover ? "cover" : "square",
        descriptionKey: isCover ? `${props.aspect.toFixed(2)}:1` : "1:1",
        ratio:          props.aspect,
      }];
    }

    editor = new FilerobotImageEditor(container, {
      source: objectUrl,
      theme: buildTheme(),
      defaultSavedImageName: "",

      onSave: async (savedImageData, designState) => {
        let blob: Blob | null = null;

        const adj = designState?.adjustments;
        const isPlainCrop =
          !!adj &&
          !adj.rotation &&
          !adj.isFlippedX &&
          !adj.isFlippedY &&
          !designState?.filter &&
          !designState?.finetunes?.length &&
          !(designState?.annotations && Object.keys(designState.annotations).length) &&
          !designState?.resize?.width &&
          !designState?.resize?.height;

        if (isPlainCrop && designState?.shownImageDimensions) {
          blob = await cropFromSource(objectUrl, adj!.crop, designState.shownImageDimensions);
        }

        if (!blob && savedImageData.imageCanvas) {
          // Wrap callback in a Promise so onSave waits before resolving.
          // Without this, the async function resolves with undefined before
          // toBlob fires, which causes Filerobot to throw an unhandled rejection.
          blob = await new Promise<Blob | null>((resolve) => {
            savedImageData.imageCanvas!.toBlob(resolve, "image/jpeg", 0.92);
          });
        } else if (!blob && savedImageData.imageBase64) {
          blob = await fetch(savedImageData.imageBase64)
            .then((r) => r.blob())
            .catch(() => null);
        }

        if (!blob) return;

        const e = editor;
        editor = null;
        e?.terminate();
        props.onConfirm(blob);
      },

      onClose: () => {
        props.onCancel();
      },

      Crop: cropConfig,

      tabsIds:        [TABS.ADJUST, TABS.FILTERS, TABS.FINETUNE, TABS.ANNOTATE, TABS.RESIZE],
      defaultTabId:   TABS.ADJUST,
      defaultToolId:  TOOLS.CROP,

      // Only affects the Filerobot-canvas fallback below (rotate/flip/filter/
      // annotate/explicit-resize saves) — plain crops bypass this via
      // cropFromSource. Filerobot's own export is already capped by the
      // on-screen editor size regardless of this value (see cropFromSource's
      // comment), so a higher multiplier just upscales that capped bitmap
      // further and blurs it more; 1 = no extra upscale on top.
      savingPixelRatio:  1,
      // Konva rasterizes the on-canvas image once via .cache() at (fit-to-editor
      // width) * previewPixelRatio, then just stretches that bitmap on zoom —
      // it never re-renders from the source. Higher = sharper zoomed-in preview,
      // at the cost of a bigger cached canvas.
      previewPixelRatio: 4,
    });

    editor.render();

    // Filerobot owns its topbar, so the skip button is rendered by us and then
    // moved into the flex row that holds Save — anywhere else it covers the
    // tool controls. Target the row, not .FIE_topbar-save itself: that class
    // sits on a fit-content wrapper that would squash the button to nothing.
    // The row only exists once React has painted, hence the frame-by-frame
    // retry (bounded, so a class rename just drops the button rather than
    // looping forever).
    let tries = 60;
    const place = () => {
      const row = container.querySelector(".FIE_topbar-buttons-wrapper");
      if (row && skipButton) {
        // Solid removes the button from wherever it *thinks* it lives on
        // dispose, so remember that spot and put it back before teardown.
        skipHome = skipButton.parentElement;
        row.appendChild(skipButton);
      } else if (tries-- > 0) requestAnimationFrame(place);
    };
    requestAnimationFrame(place);
  });

  onCleanup(() => {
    if (skipButton && skipHome) skipHome.appendChild(skipButton);
    editor?.terminate();
    editor = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    inputOverrideStyle?.remove();
    inputOverrideStyle = null;
  });

  // Filerobot renders its own full-screen UI inside this fixed container.
  // Unmounting is enough to tear the editor down (onCleanup).
  return (
    <>
      <div ref={container} style="position: fixed; inset: 0; z-index: 9999;" />
      <Show when={props.onSkip}>
        <button
          ref={skipButton}
          type="button"
          onClick={() => props.onSkip!()}
          class="ml-3 shrink-0 whitespace-nowrap px-3 py-1.5 rounded-md border border-rim text-txt text-sm hover:bg-elevated transition-colors"
        >
          {t("ui.use_original")}
        </button>
      </Show>
    </>
  );
}
