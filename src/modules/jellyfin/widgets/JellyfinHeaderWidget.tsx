// Same layout as the Cards header: the title (the server's name), the
// Music / Video switcher in the middle, and search, other devices and a ⋯
// for servers, settings and signing out on the right.
import { createSignal, createEffect, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useSearchParams } from "@solidjs/router";
import { MdFillSearch, MdFillClose, MdOutlineDevices, MdFillCheck, MdFillAdd, MdOutlineSettings, MdOutlineLogout, MdOutlineCloud_off } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { createPopover } from "@utsukta/spa-core/lib/createPopover";
import { session, servers, isConnected, adding, setAdding, setActive, signOut, hubStored, forgetOnHub } from "../store";
import { toast } from "@utsukta/spa-core/store/toast";
import { remotePlaying, useRemotePolling } from "../remote";
import { setSettingsOpen } from "../settings";
import { useSection, PAGE_PARAMS, type Section } from "../chrome/section";
import DeviceList from "../RemoteSessions";
import { IconButton } from "@ui/Button";
import { Input } from "@ui/Field";
import { Tabs } from "@ui/Tabs";
import PageActions, { useMobileActions, usePageSearch } from "@/shared/views/layout/PageActions";

const panel = "z-50 rounded-2xl bg-surface/95 backdrop-blur-xl shadow-2xl ring-1 ring-rim/60 p-2";

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
  // On mobile the search is the floating search button instead.
  const mobileActions = useMobileActions();
  usePageSearch(() => ({
    value: activeSearch(),
    placeholder: t("jellyfin.search_placeholder"),
    onSearch: (q) => setParams({ ...PAGE_PARAMS, section: params.section, search: q || undefined }),
    onClear: closeSearch,
  }));

  const devices = createPopover({ placement: "bottom-end" });

  return (
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h1 class="text-xl font-bold text-txt">{isConnected() && !adding() ? session()?.name || "Jellyfin" : "Jellyfin"}</h1>

        <Show when={isConnected() && !adding()}>
          <Tabs
            label={t("nav.jellyfin")}
            class="mx-auto"
            value={section() as Section}
            onChange={go}
            items={[
              { value: "music" as Section, label: t("jellyfin.section_music") },
              { value: "video" as Section, label: t("jellyfin.section_video") },
            ]}
          />

          <div class="flex items-center gap-1.5">
            <Show when={!mobileActions()}>
              <Show when={searching()} fallback={
                <IconButton
                  label={t("jellyfin.search")}
                  variant="outline"
                  pressed={!!activeSearch()}
                  onClick={openSearch}
                >
                  <MdFillSearch size={15} />
                </IconButton>
              }>
                <form onSubmit={submit} class="flex items-center gap-1">
                  <Input
                    class="w-36"
                    ref={field}
                    type="search"
                    value={input()}
                    onInput={(e) => setInput(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
                    placeholder={t("jellyfin.search_placeholder")}
                    aria-label={t("jellyfin.search")}
                  />
                  <IconButton label={t("jellyfin.search")} variant="outline" type="submit">
                    <MdFillSearch size={15} />
                  </IconButton>
                  <IconButton label={t("jellyfin.clear_search")} size="sm" onClick={closeSearch}>
                    <MdFillClose size={15} />
                  </IconButton>
                </form>
              </Show>
            </Show>

            <span ref={devices.ref} class="relative">
              <IconButton
                label={t("jellyfin.other_devices")}
                variant="outline"
                aria-expanded={devices.open()}
                onClick={() => devices.setOpen(!devices.open())}
              >
                <MdOutlineDevices size={15} />
              </IconButton>
              <Show when={remotePlaying().length}>
                <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent pointer-events-none" />
              </Show>
            </span>

            <PageActions actions={[
              ...servers().map((s) => ({
                label: `${s.name} · ${s.userName}`,
                icon: s.id === session()?.id ? MdFillCheck : undefined,
                onClick: () => {
                  if (s.id === session()?.id) return;
                  setActive(s.id);
                  setParams({ ...PAGE_PARAMS, section: params.section });
                },
                overflow: true,
              })),
              { label: t("jellyfin.add_server_plain"), icon: MdFillAdd, onClick: () => setAdding(true), overflow: true },
              { label: t("jellyfin.settings"), icon: MdOutlineSettings, onClick: () => setSettingsOpen(true), overflow: true },
              {
                label: t("jellyfin.sign_out_of", { server: session()?.name ?? "" }),
                title: t("jellyfin.disconnect_title", { user: session()?.userName ?? "", server: session()?.name ?? "" }),
                icon: MdOutlineLogout,
                onClick: () => { const s = session(); if (s) void signOut(s.id); },
                overflow: true,
              },
              {
                label: t("jellyfin.hub_forget"),
                title: t("jellyfin.hub_forget_help"),
                icon: MdOutlineCloud_off,
                onClick: () => {
                  const s = session();
                  if (s) forgetOnHub(s.id).then(() => toast.success(t("jellyfin.hub_forgotten"))).catch(() => toast.error(t("jellyfin.hub_store_failed")));
                },
                overflow: true,
                show: !!session() && hubStored().has(session()!.id),
              },
            ]} />
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
    </div>
  );
}
