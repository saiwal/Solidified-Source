// Settings form for AlbumStripWidget instances: pick one of the channel's
// photo albums.

import { createSignal, For } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchAlbums } from "../api/api";
import { Button } from "@ui/Button";
import { Select } from "@ui/Field";

export default function AlbumStripConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const [album, setAlbum] = createSignal(String(props.config.album ?? ""));

  const [albums] = createQueryResource("photo-albums", () => nick() || null, fetchAlbums);

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_album")}
        <Select
          size="sm"
          class="mt-1 w-full"
          value={album()}
          onChange={(e) => setAlbum(e.currentTarget.value)}
        >
          <option value="">—</option>
          <For each={albums() ?? []}>
            {(a) => (
              <option value={a.folder}>
                {a.album} ({a.total})
              </option>
            )}
          </For>
        </Select>
      </label>
      <Button size="sm" class="self-end" onClick={() => props.onSave({ album: album() })} disabled={!album()}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
