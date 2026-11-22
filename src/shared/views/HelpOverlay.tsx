// src/shared/views/HelpOverlay.tsx
import { Show, Loading } from "solid-js";
import { Portal } from "@solidjs/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { marked } from "marked";
import { useHelpMode } from "@utsukta/spa-core/store/help-mode";
import { useDocs } from "@utsukta/spa-core/lib/useDocs";
import { useI18n } from "@utsukta/spa-core/i18n";

import { Modal, ModalPanel } from "@ui/Modal";
import { IconButton } from "@ui/Button";
import { MdFillLive_help, MdOutlineClose } from "solid-icons/md";
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
          <ModalPanel size="xl" class="overflow-hidden">
            <HelpModalHeader target={helpTarget()!} onClose={exit} />
            <div class="px-5 py-4 max-h-[60vh] overflow-y-auto">
              <DocContent target={helpTarget()!} />
            </div>
          </ModalPanel>
        </Modal>
      </Show>
    </>
  );
}

/** Heading text without inline markdown (`*Solidified*` → `Solidified`). */
const plain = (h: string) => h.replace(/[*_`]/g, "").trim();
/** Fallback label from a slug while the doc loads: `account_menu` → `Account menu`. */
const humanize = (slug = "") => {
  const s = slug.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function HelpModalHeader(props: { target: string; onClose: () => void }) {
  const { t } = useI18n();
  const { docType } = useHelpMode();
  const module = () => props.target.split(".")[0];
  const section = () => props.target.split(".")[1];
  const [md] = useDocs(module, docType);

  const docTitle = () => {
    const h1 = md()?.match(/^#\s+(.+)$/m)?.[1];
    return h1 ? plain(h1) : humanize(module());
  };
  // The matched heading, or the page title when the target is a whole page
  // (or its section didn't match and the whole page is shown).
  const title = () => {
    if (!section()) return docTitle();
    const found = md() ? extractSection(md()!, section()).title : undefined;
    return found ? plain(found) : humanize(section());
  };

  return (
    <div class="flex items-start gap-3 px-5 py-4 border-b border-rim bg-elevated/40">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent-txt" aria-hidden="true">
        <MdFillLive_help size={18} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium uppercase tracking-wide text-muted truncate">
          {t("help.user_guide")}
          <Show when={section()}>
            <span aria-hidden="true"> · </span>{docTitle()}
          </Show>
        </p>
        <h2 id="help-modal-title" class="text-base font-semibold text-txt leading-snug">
          {title()}
        </h2>
      </div>
      <IconButton label={t("layout.close")} onClick={props.onClose} class="-mr-1.5 -mt-0.5">
        <MdOutlineClose size={18} />
      </IconButton>
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
    const html = marked.parse(extractSection(md()!, section()).body) as string;

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
    <Loading fallback={
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
    </Loading>
  );
}

function extractSection(md: string, section?: string): { title?: string; body: string } {
  if (!section) return { body: md };
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
  let title: string | undefined;
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
        title = heading[2];
        continue;
      }
    } else if (line.trim() !== "") {
      pendingAnchor = null;
    }
    if (insideLevel !== -1) result.push(line);
  }
  const body = result.join("\n").trim();
  return body ? { title, body } : { body: md };
}
