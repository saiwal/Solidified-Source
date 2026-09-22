// src/shared/views/HelpOverlay.tsx
import { Show, Suspense } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { marked } from "marked";
import { useHelpMode, type DocType } from "@utsukta/spa-core/store/help-mode";
import { useDocs } from "@utsukta/spa-core/lib/useDocs";
import { useI18n } from "@utsukta/spa-core/i18n";

import Modal from "@/shared/views/Modal";
export default function HelpOverlay() {
  const { t } = useI18n();
  const { helpMode, helpTarget, exit } = useHelpMode();

  return (
    <>
      <Show when={helpMode()}>
        <Portal mount={topLayer()}>
          <div class="fixed top-4 left-1/2 -translate-x-1/2 z-[9999]
                      flex items-center gap-3 px-4 py-2.5 rounded-xl
                      bg-accent text-accent-fg text-sm shadow-lg">
            <span>{t("help.click_for_help")}</span>
            <button
              onClick={exit}
              class="opacity-70 hover:opacity-100 transition-opacity leading-none"
            >
              {t("help.cancel")}
            </button>
          </div>
        </Portal>
      </Show>

      <Show when={helpTarget()}>
        <Modal onClose={exit} labelledBy="help-modal-title" class="z-[9999]">
          <div class="w-full max-w-2xl bg-surface rounded-xl border border-rim overflow-hidden">
            <HelpModalHeader target={helpTarget()!} onClose={exit} />
            <div class="px-5 py-4 max-h-[60vh] overflow-y-auto">
              <DocContent target={helpTarget()!} />
            </div>
          </div>
        </Modal>
      </Show>
    </>
  );
}

function HelpModalHeader(props: { target: string; onClose: () => void }) {
  const { t } = useI18n();
  const { docType, setDocType } = useHelpMode();

  const tabs: { id: DocType; label: () => string }[] = [
    { id: "user", label: () => t("help.user_guide") },
  ];

  return (
    <div class="border-b border-rim">
      {/* top row: breadcrumb + close */}
      <div class="flex items-center justify-between px-5 pt-4 pb-3">
        <span id="help-modal-title" class="text-sm font-medium text-txt">
          {props.target.split(".").join(" › ")}
        </span>
        <button
          onClick={props.onClose}
          aria-label={t("layout.close")}
          class="text-muted hover:text-txt transition-colors leading-none"
        >
          ✕
        </button>
      </div>

      {/* tab row */}
      <div class="flex gap-1 px-5 pb-0">
        {tabs.map((tab) => (
          <button
            onClick={() => setDocType(tab.id)}
            class={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors
              ${docType() === tab.id
                ? "border-accent text-accent bg-accent-muted"
                : "border-transparent text-muted hover:text-txt hover:bg-elevated"
              }`}
          >
            {tab.label()}
          </button>
        ))}
      </div>
    </div>
  );
}

function DocContent(props: { target: string }) {
  const { t, locale } = useI18n();
  const { docType } = useHelpMode();
  const module = () => props.target.split(".")[0];
  const section = () => props.target.split(".")[1];
  const [md] = useDocs(module, docType);

  function renderHtml(): string {
    const html = marked.parse(extractSection(md()!, section())) as string;

    // module is the doc path relative to the lang root (e.g. "hq" for
    // docs/user/en/hq.md, or "network/index" for docs/user/en/network/index.md).
    // Relative image srcs in the markdown are relative to that same directory.
    const slashIdx = module().lastIndexOf("/");
    const topicDir = slashIdx === -1 ? "" : module().slice(0, slashIdx);
    const assetBase = `/view/theme/${__THEME_SLUG__}/docs/${docType()}/${locale()}/${topicDir ? topicDir + "/" : ""}`;

    return html.replace(
      /(<img\s[^>]*src=")(?!https?:\/\/|data:|\/)(.*?)(")/gi,
      (_m, pre, src, post) => `${pre}${assetBase}${src}${post}`
    );
  }

  return (
    <Suspense fallback={
      <p class="text-sm text-muted animate-pulse">{t("help.loading")}</p>
    }>
      <Show
        when={md()}
        fallback={
          <p class="text-sm text-muted">
            {t("help.no_user_docs")}
          </p>
        }
      >
        <div
          class="prose prose-sm dark:prose-invert max-w-none"
          innerHTML={renderHtml()}
        />
      </Show>
    </Suspense>
  );
}

function extractSection(md: string, section?: string): string {
  if (!section) return md;
  // Docs are per-locale, so heading text can be fully translated and won't
  // text-match the (English) target slug. A `<!-- section_slug -->` comment
  // right before a heading pins it to the target independent of wording —
  // preferred when present, with text-match as the fallback for docs that
  // haven't been annotated yet.
  const slug = section.toLowerCase();
  const textSlug = section.replace(/_/g, " ").toLowerCase();
  const lines = md.split("\n");
  let insideLevel = -1;
  let pendingAnchor: string | null = null;
  const result: string[] = [];
  for (const line of lines) {
    const anchor = line.match(/^<!--\s*([\w-]+)\s*-->\s*$/);
    if (anchor) {
      pendingAnchor = anchor[1].toLowerCase();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (heading) {
      const level = heading[1].length;
      if (insideLevel !== -1 && level <= insideLevel) break;
      const isMatch = insideLevel === -1 && (
        pendingAnchor === slug ||
        heading[2].trim().replace(/\s+/g, " ").toLowerCase() === textSlug
      );
      pendingAnchor = null;
      if (isMatch) {
        insideLevel = level;
        continue;
      }
    } else if (line.trim() !== "") {
      pendingAnchor = null;
    }
    if (insideLevel !== -1) result.push(line);
  }
  return result.join("\n").trim() || md;
}
