// modules/directory/views/DirectoryCard.tsx
import { Show, For, createSignal, type Component } from "solid-js";
import { addConnection, censorEntry, chanviewHref, type DirectoryEntry } from "../people/api";
import { isDirectoryAdmin, setEntryCensored } from "../people/store";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillCheck, MdOutlineBlock } from "solid-icons/md";

interface Props {
  entry: DirectoryEntry;
  onSelect: (entry: DirectoryEntry) => void;
}

const DirectoryCard: Component<Props> = (props) => {
  const { t } = useI18n();
  const e = () => props.entry;
  const blurb = () => e().description || stripTags(e().about);
  const [connectState, setConnectState] = createSignal<"idle" | "pending" | "done">("idle");
  const [censoring, setCensoring] = createSignal(false);
  async function handleAdd() {
    if (connectState() !== "idle") return;
    setConnectState("pending");
    try {
      await addConnection(props.entry.address);
      setConnectState("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Follow failed");
      setConnectState("idle");
    }
  }

  async function handleCensor(severity: 0 | 1 | 2) {
    if (censoring()) return;
    setCensoring(true);
    const prev = e().censored;
    try {
      await censorEntry(e().hash, severity);
      setEntryCensored(e().hash, severity);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Censor failed");
      setEntryCensored(e().hash, prev);
    } finally {
      setCensoring(false);
    }
  }
  return (
    <div
      class="flex flex-col rounded-xl border border-rim bg-surface overflow-hidden hover:shadow-md hover:-translate-y-px transition-all duration-200 cursor-pointer group"
      onClick={() => props.onSelect(e())}
    >
      {/* ── Avatar + identity row ── */}
      <div class="flex items-center gap-3 p-4 pb-3">
        <div class="shrink-0">
          <img
            src={e().photo}
            alt={e().name}
            class="w-11 h-11 rounded-full object-cover bg-overlay ring-1 ring-rim"
            loading="lazy"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="font-semibold text-sm text-txt truncate leading-snug group-hover:text-accent transition-colors">
              {e().name}
            </span>
            <Show when={e().common_count !== null && e().common_count! > 0}>
              <span class="shrink-0 ml-auto text-xs text-accent font-medium whitespace-nowrap">
                {e().common_count} {(e().common_count ?? 0) === 1 ? t("directory.mutual") : t("directory.mutuals")}
              </span>
            </Show>
          </div>
          <p class="text-xs text-muted truncate mt-0.5">
            {e().address}
          </p>
        </div>
      </div>

      {/* ── Public forum badge ── */}
      <Show when={e().public_forum}>
        <div class="mx-4 mb-2">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-accent-muted text-accent border border-accent/30">
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
            </svg>
            {t("directory.public_forum")}
          </span>
        </div>
      </Show>

      {/* ── Blurb ── */}
      <div class="flex-1 px-4">
        <Show when={blurb()}>
          <p class="text-xs text-muted line-clamp-2 leading-relaxed">
            {blurb()}
          </p>
        </Show>
      </div>

      {/* ── Meta: location + keywords ── */}
      <div class="px-4 pt-2 pb-3 space-y-2">
        <Show when={e().location}>
          <p class="text-xs text-muted truncate flex items-center gap-1">
            <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            {e().location}
          </p>
        </Show>
        <Show when={e().keywords.length > 0}>
          <div class="flex flex-wrap gap-1">
            <For each={e().keywords.slice(0, 4)}>
              {(kw) => (
                <span class="inline-block px-1.5 py-0.5 rounded text-xs bg-overlay text-muted">
                  {kw}
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* ── Actions row — connect/ignore + (site admins only) the
             dircensor-style Unsafe/Spam moderation toggles. flex-wrap so it
             drops to a second line instead of overlapping at large text
             sizes; stopPropagation so it doesn't open the modal. ── */}
      <div
        class="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-rim mt-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        <Show
          when={!e().is_connected && connectState() !== "done"}
          fallback={
            <span class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-rim text-muted cursor-default">
              <MdFillCheck class="w-3.5 h-3.5 shrink-0" /> {t("directory.connected")}
            </span>
          }
        >
          <Show
            when={e().connect_url}
            fallback={
              <a
                href={chanviewHref(e())}
                class="flex-1 text-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-accent-fg hover:opacity-80 transition-opacity"
              >
                {t("directory.view_profile")}
              </a>
            }
          >
            <button
              onClick={handleAdd}
              disabled={connectState() === "pending"}
              class="w-full flex-1 text-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-accent-fg hover:opacity-80 transition-opacity disabled:opacity-60"
            >
              {t("directory.connect")}
            </button>
          </Show>
        </Show>
        <Show when={e().ignore_url && !e().is_connected}>
         <a
            href={e().ignore_url!}
            title={t("directory.ignore")}
            class="p-1.5 rounded-lg border border-rim text-muted hover:text-txt hover:bg-overlay transition-colors"
          >
            <MdOutlineBlock class="w-3.5 h-3.5" />
          </a>
        </Show>
        <Show when={isDirectoryAdmin()}>
          <button
            disabled={censoring()}
            onClick={() => handleCensor(e().censored > 0 ? 0 : 1)}
            title={t("directory.mark_unsafe")}
            class={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
              e().censored === 1
                ? "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400"
                : "border-red-300/60 dark:border-red-800/50 text-red-600/80 dark:text-red-400/80 hover:bg-red-500/10"
            }`}
          >
            {t("directory.unsafe")}
          </button>
          <button
            disabled={censoring()}
            onClick={() => handleCensor(e().censored > 1 ? 0 : 2)}
            title={t("directory.mark_spam")}
            class={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
              e().censored > 1
                ? "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400"
                : "border-red-300/60 dark:border-red-800/50 text-red-600/80 dark:text-red-400/80 hover:bg-red-500/10"
            }`}
          >
            {t("directory.spam")}
          </button>
        </Show>
      </div>
    </div>
  );
};

export default DirectoryCard;

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
