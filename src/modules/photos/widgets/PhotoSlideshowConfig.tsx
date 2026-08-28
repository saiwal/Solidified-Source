// Settings form for PhotoSlideshowWidget: album (or all) + seconds per photo.

import { createSignal, For } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchAlbums } from "../api/api";

export default function PhotoSlideshowConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const [album, setAlbum] = createSignal(String(props.config.album ?? ""));
  const [secs, setSecs] = createSignal(Number(props.config.interval ?? 10));

  const [albums] = createQueryResource("photo-albums", () => nick() || null, fetchAlbums);

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_album")}
        <select
          value={album()}
          onChange={(e) => setAlbum(e.currentTarget.value)}
          class="mt-1 w-full bg-elevated border border-rim rounded-lg px-2 py-1.5 text-xs text-txt"
        >
          <option value="">{t("widgets.cfg_all_albums")}</option>
          <For each={albums() ?? []}>
            {(a) => (
              <option value={a.folder}>
                {a.album} ({a.total})
              </option>
            )}
          </For>
        </select>
      </label>
      <label class="text-xs text-muted">
        {t("widgets.cfg_interval")}
        <input
          type="number"
          min="2"
          max="600"
          value={secs()}
          onInput={(e) => setSecs(Number(e.currentTarget.value))}
          class="mt-1 w-full bg-elevated border border-rim rounded-lg px-2 py-1.5 text-xs text-txt"
        />
      </label>
      <button
        onClick={() => props.onSave({ album: album(), interval: Math.max(2, secs() || 10) })}
        class="self-end px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium
               hover:brightness-110 transition-all"
      >
        {t("widgets.cfg_save")}
      </button>
    </div>
  );
}
