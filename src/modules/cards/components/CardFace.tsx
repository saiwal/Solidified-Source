// One card, laid out for what it holds. The template a card was authored with
// (iconfig cat 'card', k 'template') decides the body: a quote reads as a
// pull-quote, a link as a link row, a definition as term + full text, a
// freeform card as its title or, untitled, its own text. Everything below the
// body — deck badge, terms, read-more, share — is shared.
//
// Bodies are parsed with the composer's own parseTemplate so the two can't
// drift; `template` is only a hint, so we fall back to sniffTemplate for cards
// authored before the field existed (and for federated ones that never had it).

import { Show, For } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineShare, MdOutlineFormat_quote, MdOutlineMenu_book,
         MdOutlineLink, MdOutlineNotes } from "solid-icons/md";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { cardPath, shareTargetForCard } from "@/shared/lib/shareLinks";
import { openShare } from "@utsukta/spa-core/store/share";
import { parseTemplate, sniffTemplate, type CardTemplate } from "@/shared/editor/lib/cardTemplates";

const TEMPLATE_ICON: Record<string, (s: number) => ReturnType<typeof MdOutlineNotes>> = {
  quote:      (s) => <MdOutlineFormat_quote size={s} />,
  definition: (s) => <MdOutlineMenu_book size={s} />,
  link:       (s) => <MdOutlineLink size={s} />,
  freeform:   (s) => <MdOutlineNotes size={s} />,
};

/** First [img]/[zmg] URL in a bbcode body, if any. */
function coverOf(body: string): string {
  return body.match(/\[z?img[^\]]*\](.*?)\[\/z?img\]/i)?.[1]?.trim() ?? "";
}

/** Plain-text excerpt with bbcode tags stripped. */
function excerpt(src: string, max = 220): string {
  const text = src.replace(/\[[^\]]{0,60}\]/g, "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** host + a shortened path, e.g. example.com/a/long/pa… — URL() so a malformed
 *  href degrades to the raw string rather than throwing. */
function prettyUrl(url: string, max = 42): string {
  let s = url;
  try {
    const u = new URL(url);
    s = u.host.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname) + u.search;
  } catch { /* not a parseable URL — show it as typed */ }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export default function CardFace(props: { card: Post; nick: string }) {
  const { t } = useI18n();

  const raw = () => props.card.rawBody ?? props.card.body ?? "";
  const template = (): CardTemplate =>
    (props.card.template as CardTemplate) || sniffTemplate(raw()) || "freeform";
  const fields = () => parseTemplate(raw());
  const cover = () => coverOf(raw());
  const deck = () => props.card.deck;
  const title = () => props.card.title?.trim() ?? "";
  const terms = () =>
    [...(props.card.categories ?? []), ...(props.card.tags ?? []).map((x) => `#${x}`)].slice(0, 4);

  return (
    <div class="overflow-hidden rounded-2xl border border-rim bg-surface shadow-sm flex flex-col">
      {/* Cover, when the body carries one (link thumbnails, freeform photos) */}
      <Show when={cover()}>
        <img src={cover()} alt="" loading="lazy" class="w-full h-36 object-cover" />
      </Show>

      <div class="p-4 flex flex-col gap-2 flex-1">
        {/* ── Kind marker + deck ── */}
        <div class="flex items-center gap-2 text-muted">
          <span class="shrink-0">{(TEMPLATE_ICON[template()] ?? TEMPLATE_ICON.freeform)(15)}</span>
          <Show when={deck()}>
            <span class="px-1.5 py-0.5 rounded text-[0.625rem] font-medium bg-accent/15 text-accent">
              {deck()!.name}
              <Show when={deck()!.order != null}> · {deck()!.order}</Show>
            </span>
          </Show>
        </div>

        {/* ── Body, per template ── */}
        <Show when={template() === "quote"}>
          <div class="relative">
            <span class="absolute -top-3 -left-1 text-5xl leading-none text-accent/20 select-none">“</span>
            <p class="relative text-sm text-txt italic leading-relaxed pl-4">
              {excerpt(fields().quoteText || raw(), 320)}
            </p>
          </div>
          {/* Only a real attribution — the channel is not the quote's author. */}
          <Show when={fields().quoteAttribution}>
            <p class="text-xs text-muted text-right">— {fields().quoteAttribution}</p>
          </Show>
        </Show>

        <Show when={template() === "definition"}>
          <h3 class="text-base font-semibold leading-snug text-txt">
            {fields().defTerm || title() || t("cards.untitled")}
          </h3>
          <p class="text-sm text-txt leading-relaxed whitespace-pre-line">
            {fields().defBody || excerpt(raw(), 600)}
          </p>
        </Show>

        <Show when={template() === "link"}>
          <h3 class="text-base font-semibold leading-snug text-txt line-clamp-2">
            {title() || fields().linkTitle || t("cards.untitled")}
          </h3>
          <a
            href={fields().linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            class="flex items-center gap-1.5 text-xs text-accent hover:underline truncate"
          >
            <MdOutlineLink size={13} class="shrink-0" />
            <span class="truncate">{prettyUrl(fields().linkUrl ?? "")}</span>
          </a>
          <Show when={fields().linkNote}>
            <p class="text-sm text-muted leading-snug line-clamp-3">{excerpt(fields().linkNote ?? "")}</p>
          </Show>
        </Show>

        <Show when={template() === "freeform"}>
          <Show when={title()}>
            <h3 class="text-base font-semibold leading-snug text-txt line-clamp-3">{title()}</h3>
          </Show>
          {/* Untitled freeform cards are their text, so give it the full run;
              titled ones only get a teaser under the heading. */}
          <p
            class="text-sm text-txt leading-relaxed"
            classList={{ "line-clamp-4 text-muted": !!title() }}
          >
            {excerpt(props.card.summary?.trim() || raw(), title() ? 220 : 400)}
          </p>
        </Show>

        {/* ── Terms ── */}
        <Show when={terms().length > 0}>
          <div class="flex flex-wrap gap-1">
            <For each={terms()}>
              {(term) => (
                <span class="px-1.5 py-0.5 rounded text-[0.625rem] bg-elevated text-muted">{term}</span>
              )}
            </For>
          </div>
        </Show>

        {/* ── Footer ── */}
        <div class="mt-auto flex items-center gap-2 pt-2 border-t border-rim">
          <A
            href={cardPath(props.nick, props.card)}
            class="text-xs font-medium text-accent hover:underline"
          >
            {t("cards.read_full_card")}
          </A>
          <button
            type="button"
            onClick={() => openShare(shareTargetForCard(props.nick, props.card))}
            title={t("share.action")}
            class="ml-auto shrink-0 p-1 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
          >
            <MdOutlineShare size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
