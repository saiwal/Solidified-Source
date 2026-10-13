// Same layout as the Cards header: the title (the server's name), the
// Music / Video switcher in the middle, and search, other devices and a ⋯
// for servers, settings and signing out on the right.
import { createSignal, createEffect, Show, For } from "solid-js";
import { Portal } from "solid-js/web";
import { useSearchParams } from "@solidjs/router";
import { MdFillSearch, MdFillClose, MdOutlineDevices, MdOutlineMore_horiz, MdFillCheck, MdFillAdd, MdOutlineSettings, MdOutlineLogout } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { createPopover } from "@/shared/stream/filters/createPopover";
import { session, servers, isConnected, adding, setAdding, setActive, signOut } from "../store";
import { remotePlaying, useRemotePolling } from "../remote";
import { setSettingsOpen } from "../settings";
import { useSection, PAGE_PARAMS, type Section } from "../chrome/section";
import DeviceList from "../RemoteSessions";

const panel = "z-50 rounded-2xl bg-surface/95 backdrop-blur-xl shadow-2xl ring-1 ring-rim/60 p-2";
const menuItem = "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-txt hover:bg-elevated/70 text-left";

export default function JellyfinHeaderWidget() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const { section, go } = useSection();
  useRemotePolling();

  // ── search: an icon until wanted, then a quiet underlined field ──
  const activeSearch = () => String(params.search ?? "");
  const [searching, setSearching] = createSignal(!!activeSearch());
  const [input, setInput] = createSignal(activeSearch());
  createEffect(() => setInput(activeSearch())); // follow Back/Forward
  let field: HTMLInputElement | undefined;
  const openSearch = () => { setSearching(true); queueMicrotask(() => field?.focus()); };
  const submit = (e: Event) => {
    e.preventDefault();
    const q = input().trim();
    setParams({ ...PAGE_PARAMS, section: params.section, search: q || undefined });
  };
  const closeSearch = () => { setSearching(false); setInput(""); if (activeSearch()) setParams({ search: undefined }); };

  const devices = createPopover({ placement: "bottom-end" });
  const more = createPopover({ placement: "bottom-end" });

  // Same vocabulary as the Cards header: bordered square icon buttons
  const squareBtn = "p-1.5 rounded-lg border border-rim bg-surface text-muted hover:bg-elevated hover:text-txt transition-colors";

  return (
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h1 class="text-xl font-bold text-txt">{isConnected() && !adding() ? session()?.name || "Jellyfin" : "Jellyfin"}</h1>

        <Show when={isConnected() && !adding()}>
          <div class="flex gap-1 p-1 bg-elevated rounded-lg w-fit mx-auto">
            <For each={[["music", "jellyfin.section_music"] as const, ["video", "jellyfin.section_video"] as const]}>
              {([key, label]) => (
                <button type="button" aria-pressed={section() === key} onClick={() => go(key as Section)}
                  class={`px-3 text-center text-xs py-1 rounded-md transition-colors font-medium
                    ${section() === key ? "bg-accent text-accent-fg font-semibold" : "text-muted hover:text-txt"}`}>
                  {t(label)}
                </button>
              )}
            </For>
          </div>

          <div class="flex items-center gap-1.5">
            <Show when={searching()} fallback={
              <button type="button" title={t("jellyfin.search")} aria-label={t("jellyfin.search")} onClick={openSearch}
                class={`p-1.5 rounded-lg border transition-colors ${activeSearch()
                  ? "bg-accent text-accent-fg border-accent"
                  : "border-rim bg-surface text-muted hover:bg-elevated hover:text-txt"}`}>
                <MdFillSearch size={15} />
              </button>
            }>
              <form onSubmit={submit} class="flex items-center gap-1">
                <input ref={field} type="search" value={input()} onInput={(e) => setInput(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
                  placeholder={t("jellyfin.search_placeholder")} aria-label={t("jellyfin.search")}
                  class="w-36 px-2 py-1 text-sm rounded-lg border border-rim bg-surface text-txt outline-none focus:border-accent" />
                <button type="submit" title={t("jellyfin.search")}
                  class="p-1.5 rounded-lg border border-rim bg-elevated text-txt hover:bg-overlay transition-colors">
                  <MdFillSearch size={15} />
                </button>
                <button type="button" title={t("jellyfin.clear_search")} onClick={closeSearch}
                  class="p-1.5 text-muted hover:text-txt transition-colors">
                  <MdFillClose size={15} />
                </button>
              </form>
            </Show>

            <span ref={devices.ref} class="relative">
              <button type="button" class={squareBtn} title={t("jellyfin.other_devices")} aria-label={t("jellyfin.other_devices")}
                aria-expanded={devices.open()} onClick={() => devices.setOpen(!devices.open())}>
                <MdOutlineDevices size={15} />
              </button>
              <Show when={remotePlaying().length}>
                <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent pointer-events-none" />
              </Show>
            </span>

            <span ref={more.ref}>
              <button type="button" class={squareBtn} title={t("jellyfin.more")} aria-label={t("jellyfin.more")}
                aria-expanded={more.open()} onClick={() => more.setOpen(!more.open())}>
                <MdOutlineMore_horiz size={15} />
              </button>
            </span>
          </div>
        </Show>
      </div>

      <Show when={devices.open()}>
        <Portal mount={topLayer()}>
          <div ref={devices.floating} style={devices.style()} class={`${panel} w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto`}>
            <p class="px-3 pt-1 pb-2 text-sm text-muted">{t("jellyfin.other_devices")}</p>
            <DeviceList onAction={() => devices.setOpen(false)} />
          </div>
        </Portal>
      </Show>

      <Show when={more.open()}>
        <Portal mount={topLayer()}>
          <div ref={more.floating} style={more.style()} class={`${panel} w-64`}>
            <For each={servers()}>
              {(s) => (
                <button type="button" class={menuItem} onClick={() => {
                  more.setOpen(false);
                  if (s.id === session()?.id) return;
                  setActive(s.id);
                  setParams({ ...PAGE_PARAMS, section: params.section });
                }}>
                  <span class="w-4 shrink-0 text-accent-txt">{s.id === session()?.id ? <MdFillCheck size={16} /> : null}</span>
                  <span class="min-w-0">
                    <span class="block truncate">{s.name}</span>
                    <span class="block text-xs text-muted truncate">{s.userName}</span>
                  </span>
                </button>
              )}
            </For>
            <button type="button" class={menuItem} onClick={() => { more.setOpen(false); setAdding(true); }}>
              <span class="w-4 shrink-0 text-muted"><MdFillAdd size={16} /></span> {t("jellyfin.add_server_plain")}
            </button>
            <div class="my-1.5 h-px bg-rim/60" />
            <button type="button" class={menuItem} onClick={() => { more.setOpen(false); setSettingsOpen(true); }}>
              <span class="w-4 shrink-0 text-muted"><MdOutlineSettings size={16} /></span> {t("jellyfin.settings")}
            </button>
            <button type="button" class={menuItem}
              title={t("jellyfin.disconnect_title", { user: session()?.userName ?? "", server: session()?.name ?? "" })}
              onClick={() => { more.setOpen(false); const s = session(); if (s) void signOut(s.id); }}>
              <span class="w-4 shrink-0 text-muted"><MdOutlineLogout size={16} /></span>
              <span class="truncate">{t("jellyfin.sign_out_of", { server: session()?.name ?? "" })}</span>
            </button>
          </div>
        </Portal>
      </Show>
    </div>
  );
}
