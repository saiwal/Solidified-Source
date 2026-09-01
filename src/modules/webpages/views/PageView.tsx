import { createEffect, onCleanup, Show } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { MdOutlineEdit_note } from "solid-icons/md";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { renderBody, needsServerRender } from "@utsukta/spa-core/lib/renderBody";
import { handleNsfwToggleClick } from "@utsukta/spa-core/lib/nsfw";
import { handleDecryptClick } from "@utsukta/spa-core/lib/decrypt-click";
import { hydrateLatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { useToc } from "@utsukta/spa-core/lib/useToc";
import ArticleToc from "@/shared/views/ArticleToc";
import { fetchWebPageByPagelink } from "../api";
import { setCurrentPageTemplateId, setCurrentPageChrome } from "../store";
import { templateChrome, pageTemplateChrome } from "@utsukta/spa-core/store/widget-templates";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";

// Renders a Hubzilla webpage inline in the SPA by fetching its body via the
// JSON API, via the shared renderBody() helper (bbcode/html/markdown).
//
// Note: pages with custom Comanche layouts will still render their body content
// correctly here; only the layout chrome (sidebars, regions) is intentionally
// omitted — the page body is what the author actually wrote.

export default function PageView() {
  const { t } = useI18n();
  const params = useParams<{ nick: string; path: string }>();

  // params.path is the wildcard segment after /page/:nick/
  const pagelink = () => params.path ?? "";
  const nick = () => params.nick ?? "";

  const [detail] = createQueryResource(
    "webpage",
    () => ({ nick: nick(), pagelink: pagelink() }),
    ({ nick, pagelink }) => fetchWebPageByPagelink(nick, pagelink),
  );

  const rendered = () => {
    const d = detail();
    if (!d) return "";
    return renderBody(d.body ?? "", d.mimetype);
  };

  // Track the page's assigned layout template (see ModuleDef.pageTemplate in
  // webpages/index.ts) — cleared on navigation away so the next page (or a
  // non-webpage route) doesn't inherit stale scoping.
  createEffect(() => setCurrentPageTemplateId(detail()?.layout_template ?? null));
  onCleanup(() => setCurrentPageTemplateId(null));

  // Chrome mode (see ModuleDef.pageChrome) is derived from the page's
  // assigned template's own `chrome` field — not a separate per-page field.
  const viewerRole = useViewerRole();
  const isPageOwner = () => viewerRole() === "owner";
  createEffect(() => {
    const tid = detail()?.layout_template;
    setCurrentPageChrome(tid ? (isPageOwner() ? templateChrome : pageTemplateChrome)(tid) : "default");
  });
  onCleanup(() => setCurrentPageChrome("default"));

  let bodyRef: HTMLDivElement | undefined;
  createEffect(() => {
    rendered();
    if (bodyRef) hydrateLatex(bodyRef);
  });
  const { toc, activeId } = useToc(rendered, () => bodyRef);

  // Wires up the interactive elements bbcodeToHtml() can embed in rendered()
  // (NSFW reveal toggle, encrypted-content decrypt button) — both are inert
  // without this, see nsfw.ts/decrypt-click.ts.
  function onBodyClick(e: MouseEvent) {
    if (handleNsfwToggleClick(e)) return;
    handleDecryptClick(e);
  }

  return (
    <div class="relative max-w-5xl mx-auto space-y-4 py-4">
      {/* Loading skeleton */}
      <Show when={detail.loading}>
        <div class="space-y-3 animate-pulse">
          <div class="h-8 bg-elevated rounded w-2/3" />
          <div class="h-3 bg-elevated rounded w-full" />
          <div class="h-3 bg-elevated rounded w-5/6" />
          <div class="h-3 bg-elevated rounded w-full" />
          <div class="h-3 bg-elevated rounded w-4/5" />
        </div>
      </Show>

      {/* Error */}
      <Show when={detail.error}>
        <div class="p-4 rounded-xl border border-red-300 bg-red-50 text-red-700 text-sm">
          {detail.error?.message ?? t("webpages.load_failed")}
        </div>
      </Show>

      {/* Page content */}
      <Show when={!detail.loading && detail()}>
        <div class="xl:flex xl:gap-8">
          {/* ── TOC — sticky sidebar on xl+, sticky collapsed launcher below xl ── */}
          <ArticleToc entries={toc()} activeId={activeId()} label={t("webpages.on_this_page")} />

          <article class="min-w-0 flex-1 max-w-none xl:max-w-3xl bg-surface rounded-xl border border-rim p-6 space-y-4">
            <div class="flex items-start gap-3">
              <Show when={detail()!.title}>
                <h1 class="flex-1 text-2xl font-bold text-txt">{detail()!.title}</h1>
              </Show>
              <Show when={isPageOwner()}>
                <A
                  href={`/webpages/${nick()}/edit/${detail()!.iid}`}
                  class="ml-auto p-1.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors"
                  title={t("webpages.edit") as string}
                  aria-label={t("webpages.edit") as string}
                >
                  <MdOutlineEdit_note size={18} />
                </A>
              </Show>
            </div>
            {/* application/x-php pages are eval'd server-side by core's
                prepare_text(); there is nothing the SPA can render, so point
                the reader at the classic view instead of an empty article. */}
            <Show
              when={!needsServerRender(detail()?.mimetype)}
              fallback={
                <p class="text-sm text-muted">
                  {t("editor.format_php_unsupported")}{" "}
                  <a
                    class="text-accent hover:underline"
                    href={`/page/${nick()}/${pagelink()}`}
                  >
                    {t("webpages.view")}
                  </a>
                </p>
              }
            >
              <div
                ref={bodyRef}
                class="prose dark:prose-invert max-w-none"
                onClick={onBodyClick}
                // eslint-disable-next-line solid/no-innerhtml
                innerHTML={rendered()}
              />
            </Show>
          </article>
        </div>
      </Show>
    </div>
  );
}
