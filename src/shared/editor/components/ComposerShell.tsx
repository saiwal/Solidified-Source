/**
 * ComposerShell.tsx
 * The single source of truth for composer layout rhythm.
 *
 * Before this existed the nine composers carried five different spacing
 * scales (space-y-4 / gap-4 / space-y-3 / gap-3 / space-y-2) and each
 * re-declared its own options and action rows — byte-identical strings in
 * Article, Card, Webpage and Block. This owns that rhythm so a composer only
 * decides *what* goes in each region, never how the regions are spaced.
 *
 * Deliberately sets no padding, no `max-w-*` and no `mx-auto`: the outer box
 * belongs to the host (the page view's own wrapper plus Layout's page
 * padding, or ComposerModal's dialog). An auto cross-axis margin on a flex
 * item also overrides align-self: stretch, which would make the composer size
 * to fit-content instead of the row — the hazard CardComposer documents at
 * its own render root.
 */

import { Show, type Component, type JSX } from "solid-js";

/**
 * Collapses a region whose content is currently all hidden.
 *
 * `<Show when={props.x}>` only tells us the prop was passed — a fragment is
 * truthy even when every <Show> inside it is false. Without this the wrapper
 * still renders, and since the root is a `gap-4` flex column an empty div is
 * still a flex item with a gap on either side: a blank band (and, for the
 * options row, a stray border-t rule).
 *
 * `:has(> *)` and not `:empty`, because Solid leaves empty text-node markers
 * where a false <Show> was and those defeat `:empty`; `:has(> *)` tests for
 * element children and ignores them.
 */
const collapseWhenEmpty = "[&:not(:has(>*))]:hidden";

export interface ComposerShellProps {
  /** Meta fields — title, summary, slug, format/language, series, category. */
  meta?: JSX.Element;
  /** RichEditor (+ AttachmentBar), the region that absorbs spare height. */
  editor: JSX.Element;
  /** Full-width extras below the editor: encrypt/decrypt, drafts, location. */
  panels?: JSX.Element;
  /** ACL, expiry, schedule, disable-comments, encrypt toggle. Omit for the
   *  composers that have no options (wiki, note) so they get no stray rule. */
  options?: JSX.Element;
  /** Discard / save-draft / clear / submit. */
  actions: JSX.Element;
  /**
   * Overrides the editor region's wrapper classes. Pass "contents" when the
   * composer must own that box itself — CardComposer hides its editor with
   * classList for the assembled templates, and a wrapper with a fixed
   * min-height would otherwise reserve 360px of dead space while it is hidden.
   */
  editorClass?: string;
  /**
   * Outer-box classes from the host. Modal composers pass "p-4" (ComposerModal's
   * body is deliberately unpadded, and padding it there would double up for the
   * callers that pass their own already-padded children). Page-hosted composers
   * pass nothing and inherit Layout's page padding.
   */
  class?: string;
}

const ComposerShell: Component<ComposerShellProps> = (props) => (
  <div class={`flex flex-col flex-1 min-h-0 gap-4 ${props.class ?? ""}`}>
    <Show when={props.meta}>
      <div class={`shrink-0 space-y-4 ${collapseWhenEmpty}`}>{props.meta}</div>
    </Show>

    <div class={props.editorClass ?? "flex-1 min-h-[360px] flex flex-col"}>{props.editor}</div>

    <Show when={props.panels}>
      <div class={`shrink-0 space-y-4 ${collapseWhenEmpty}`}>{props.panels}</div>
    </Show>

    <Show when={props.options}>
      <div
        class={`shrink-0 flex flex-wrap items-center gap-3 ${collapseWhenEmpty}`}
      >
        {props.options}
      </div>
    </Show>

    <div class="shrink-0 flex flex-wrap items-center gap-3 pb-3">{props.actions}</div>
  </div>
);

export default ComposerShell;
