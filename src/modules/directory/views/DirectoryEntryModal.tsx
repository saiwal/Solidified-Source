// modules/directory/views/DirectoryEntryModal.tsx
import { Show, For, type Component, createEffect, createSignal, on } from "solid-js";
import { Portal } from "solid-js/web";
import { chanviewHref, type DirectoryEntry } from "../people/api";
import { connectToChannel } from "../connections/api";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillCheck } from "solid-icons/md";

interface Props {
  entry: DirectoryEntry | null;
  onClose: () => void;
}

const DirectoryEntryModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const e = () => props.entry;

  const [connecting, setConnecting] = createSignal(false);
  const [connectError, setConnectError] = createSignal("");
  const [justConnected, setJustConnected] = createSignal(false);
  const isConnected = () => !!e()?.is_connected || justConnected();

  async function handleConnect() {
    setConnecting(true);
    setConnectError("");
    try {
      await connectToChannel(e()!.address);
      setJustConnected(true);
      toast.success(t("directory.connected"));
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setConnecting(false);
    }
  }

  const handleBackdrop = (ev: MouseEvent) => {
    if (ev.target === ev.currentTarget) props.onClose();
  };

  let closeButtonRef: HTMLButtonElement | undefined;
  createEffect(on(() => !!e(), (visible) => {
    if (visible) requestAnimationFrame(() => closeButtonRef?.focus());
  }, { defer: true }));

  createEffect(on(() => props.entry, () => {
    setJustConnected(false);
    setConnectError("");
  }));

  return (
    <Show when={e()}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={handleBackdrop}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={e()!.name}
            tabindex="-1"
            class="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl bg-surface shadow-2xl overflow-hidden focus:outline-none"
          >

            {/* ── Cover banner ── */}
            <Show when={e()!.cover}>
              <div class="h-28 overflow-hidden bg-overlay shrink-0">
                <img src={e()!.cover!} alt="" aria-hidden="true" class="w-full h-full object-cover"/>
              </div>
            </Show>

            {/* ── Header ── */}
            <div class={`flex items-start gap-4 px-5 pb-4 border-b border-rim ${e()!.cover ? '-mt-8 pt-2' : 'pt-5'}`}>
              <a href={chanviewHref(e()!)} class="shrink-0">
                <img
                  src={e()!.photo}
                  alt={e()!.name}
                  class={`w-16 h-16 rounded-full object-cover bg-overlay ${e()!.cover ? 'ring-[3px] ring-surface shadow-md' : 'ring-2 ring-rim'}`}
                />
              </a>
              <div class="flex-1 min-w-0 pt-0.5">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <a
                      href={chanviewHref(e()!)}
                      class="font-bold text-base text-txt hover:underline leading-tight block"
                    >
                      {e()!.name}
                    </a>
                    <p class="text-xs text-muted truncate mt-0.5">
                      {e()!.address}
                    </p>
                  </div>
                  <button
                    ref={(el) => (closeButtonRef = el)}
                    onClick={props.onClose}
                    class="shrink-0 p-1.5 rounded-lg text-muted hover:text-txt hover:bg-overlay transition-colors"
                    aria-label={t("directory.close")}
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>

                {/* Badges row */}
                <div class="flex flex-wrap gap-1.5 mt-2">
                  <Show when={e()!.public_forum}>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-accent-muted text-accent border border-accent/30">
                      <svg aria-hidden="true" class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
                        <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
                      </svg>
                      {t("directory.public_forum")}
                    </span>
                  </Show>
                  <Show when={e()!.is_connected}>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-accent-muted text-accent border border-accent/30">
                      <MdFillCheck class="w-3.5 h-3.5 shrink-0" /> {t("directory.connected")}
                    </span>
                  </Show>
                  <Show when={e()!.common_count !== null && e()!.common_count! > 0}>
                    <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-accent-muted text-accent border border-accent/30">
                      {e()!.common_count} {(e()!.common_count ?? 0) === 1 ? t("directory.mutual") : t("directory.mutuals")}
                    </span>
                  </Show>
                </div>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div class="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Description / about */}
              <Show when={e()!.description || e()!.about}>
                <p class="text-sm text-txt leading-relaxed">
                  {e()!.description || stripTags(e()!.about)}
                </p>
              </Show>

              {/* Contact details grid */}
              <div class="space-y-2">
                <Show when={e()!.location}>
                  <DetailRow icon="location">
                    {e()!.location}
                  </DetailRow>
                </Show>
                <Show when={e()!.hometown}>
                  <DetailRow icon="hometown">
                    {e()!.hometown}
                  </DetailRow>
                </Show>
                <Show when={e()!.homepage}>
                  <DetailRow icon="link">
                   <a 
                      href={e()!.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-accent hover:underline break-all"
                    >
                      {e()!.homepage}
                    </a>
                  </DetailRow>
                </Show>
                <Show when={e()!.gender}>
                  <DetailRow icon="person">{e()!.gender}</DetailRow>
                </Show>
                <Show when={e()!.marital}>
                  <DetailRow icon="heart">{e()!.marital}</DetailRow>
                </Show>
                <Show when={e()!.age !== null && e()!.age !== undefined}>
                  <DetailRow icon="age">{e()!.age} years old</DetailRow>
                </Show>
              </div>

              {/* Keywords */}
              <Show when={e()!.keywords.length > 0}>
                <div>
                  <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t("directory.interests")}</p>
                  <div class="flex flex-wrap gap-1.5">
                    <For each={e()!.keywords}>
                      {(kw) => (
                        <span class="inline-block px-2 py-0.5 rounded text-xs bg-overlay text-muted">
                          {kw}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>

            {/* ── Footer actions ── */}
            <div class="flex items-center gap-2 px-5 py-4 border-t border-rim flex-wrap">
              <Show when={!isConnected()}>
                <Show
                  when={e()!.connect_url}
                  fallback={
                    <a
                      href={chanviewHref(e()!)}
                      class="flex-1 text-center px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-accent-fg hover:opacity-80 transition-opacity"
                    >
                      {t("directory.view_profile")}
                    </a>
                  }
                >
                  <button
                    onClick={handleConnect}
                    disabled={connecting()}
                    class="flex-1 text-center px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-accent-fg hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  >
                    {connecting() ? t("directory.connecting") : t("directory.connect")}
                  </button>
                </Show>
              </Show>
             <Show when={isConnected() || e()!.connect_url}>
                <a
                  href={chanviewHref(e()!)}
                  class="px-4 py-2 rounded-lg text-sm font-medium border border-rim text-muted hover:bg-overlay transition-colors"
                >
                  {t("directory.view_profile")}
                </a>
              </Show>
              <Show when={e()!.ignore_url && !isConnected()}>
               <a
                  href={e()!.ignore_url!}
                  title={t("directory.ignore")}
                  class="p-2 rounded-lg border border-rim text-muted hover:text-txt hover:bg-overlay transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                  </svg>
                </a>
              </Show>
              <Show when={connectError()}>
                <p class="w-full text-xs text-red-600 dark:text-red-400">{connectError()}</p>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

// ── Icon row helper ──────────────────────────────────────────────────────────

type IconKey = "location" | "hometown" | "link" | "person" | "heart" | "age";

const ICONS: Record<IconKey, string> = {
  location: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z",
  hometown: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  link: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  person: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  heart: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  age: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
};

const DetailRow: Component<{ icon: IconKey; children: any }> = (props) => (
  <div class="flex items-start gap-2.5 text-sm text-txt">
    <svg aria-hidden="true" class="w-4 h-4 shrink-0 mt-0.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={ICONS[props.icon]}/>
    </svg>
    <span class="leading-snug">{props.children}</span>
  </div>
);

export default DirectoryEntryModal;

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
