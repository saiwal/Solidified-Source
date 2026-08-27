// The flip card: cover/title on the front, detail on the back.
//
// Flip trigger differs by input: pointer devices flip on hover (there is no
// tap to spend), touch devices flip on tap and need an explicit way back, so
// the back gets its own close affordance there. The `(hover: hover)` media
// query is the only reliable discriminator — a coarse pointer that also
// reports hover (some 2-in-1s) still gets the hover behaviour, which is fine.

import { Show, For, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineShare, MdOutlineFormat_quote, MdOutlineMenu_book,
         MdOutlineLink, MdOutlineNotes } from "solid-icons/md";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { cardPath, shareTargetForCard } from "@/shared/lib/shareLinks";
import { openShare } from "@utsukta/spa-core/store/share";

const PATTERN = `${import.meta.env.BASE_URL}patterns/cardboard.png`;

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

/**
 * Quote cards store `[quote=Author]text[/quote]` (core bbcode, so they render
 * everywhere). Pull the attribution out so the back can show it as a byline
 * instead of the generic author line.
 */
function quoteParts(body: string): { text: string; attribution: string } | null {
  const m = body.match(/\[quote=["']?(.*?)["']?\]([\s\S]*?)\[\/quote\]/i);
  if (!m) return null;
  return { attribution: m[1].trim(), text: m[2].trim() };
}

export default function CardFace(props: { card: Post; nick: string }) {
  const { t } = useI18n();
  const [flipped, setFlipped] = createSignal(false);

  const template = () => props.card.template || "freeform";
  const cover = () => coverOf(props.card.rawBody ?? props.card.body ?? "");
  const quote = () => (template() === "quote" ? quoteParts(props.card.rawBody ?? "") : null);
  const deck = () => props.card.deck;

  const summary = () =>
    props.card.summary?.trim() || excerpt(props.card.rawBody ?? props.card.body ?? "");


  return (
    <div
      class="group/card [perspective:1200px] h-64 w-full"
      onClick={() => setFlipped((v) => !v)}
    >
      <div
        class="relative h-full w-full transition-transform duration-500 transform-3d
               group-hover/card:[transform:rotateY(180deg)] motion-reduce:transition-none"
        style={flipped() ? { transform: "rotateY(180deg)" } : undefined}
      >
        {/* ── Front ── */}
        <div
          class="absolute inset-0 backface-hidden overflow-hidden rounded-2xl border border-rim
                 bg-surface shadow-sm flex flex-col justify-end"
          style={
            cover()
              ? { "background-image": `url(${cover()})`, "background-size": "cover", "background-position": "center" }
              : { "background-image": `url(${PATTERN})`, "background-repeat": "repeat" }
          }
        >
          {/* Scrim only where there's a photo behind the text */}
          <Show when={cover()}>
            <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          </Show>

          <div class="relative p-4 space-y-1.5">
            <div class="flex items-center gap-2">
              <span class={`shrink-0 ${cover() ? "text-white/80" : "text-muted"}`}>
                {TEMPLATE_ICON[template()]?.(15) ?? TEMPLATE_ICON.freeform(15)}
              </span>
              <Show when={deck()}>
                <span class="px-1.5 py-0.5 rounded text-[0.625rem] font-medium bg-accent/15 text-accent">
                  {deck()!.name}
                  <Show when={deck()!.order != null}> · {deck()!.order}</Show>
                </span>
              </Show>
            </div>
            <h3 class={`text-base font-semibold leading-snug line-clamp-3 ${cover() ? "text-white" : "text-txt"}`}>
              {props.card.title || t("cards.untitled")}
            </h3>
          </div>
        </div>

        {/* ── Back ── */}
        <div
          class="absolute inset-0 backface-hidden [transform:rotateY(180deg)] overflow-hidden
                 rounded-2xl border border-rim bg-surface shadow-sm p-4 flex flex-col gap-2"
        >
          <Show
            when={quote()}
            fallback={
              <>
                <p class="text-sm text-txt leading-snug overflow-hidden flex-1">{summary()}</p>
                <p class="text-xs text-muted">
                  {t("cards.by")}{" "}
                  <span class="text-txt">{props.card.authorName}</span>
                </p>
              </>
            }
          >
            {(q) => (
              <>
                <div class="flex-1 overflow-hidden relative">
                  <span class="absolute -top-3 -left-1 text-5xl leading-none text-accent/20 select-none">“</span>
                  <p class="relative text-sm text-txt italic leading-snug pl-4">{excerpt(q().text)}</p>
                </div>
                <p class="text-xs text-muted text-right">— {q().attribution || props.card.authorName}</p>
              </>
            )}
          </Show>

          <Show when={(props.card.categories?.length ?? 0) > 0 || (props.card.tags?.length ?? 0) > 0}>
            <div class="flex flex-wrap gap-1">
              <For each={[...(props.card.categories ?? []), ...(props.card.tags ?? []).map((x) => `#${x}`)].slice(0, 4)}>
                {(term) => (
                  <span class="px-1.5 py-0.5 rounded text-[0.625rem] bg-elevated text-muted">{term}</span>
                )}
              </For>
            </div>
          </Show>

          <div class="flex items-center gap-2 pt-1 border-t border-rim">
            <A
              href={cardPath(props.nick, props.card)}
              onClick={(e) => e.stopPropagation()}
              class="text-xs font-medium text-accent hover:underline"
            >
              {t("cards.read_full_card")}
            </A>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openShare(shareTargetForCard(props.nick, props.card));
              }}
              title={t("share.action")}
              class="ml-auto p-1 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
            >
              <MdOutlineShare size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
