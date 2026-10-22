// Settings form for RoomCardWidget instances: pick one of the channel's
// chatrooms.

import { createSignal, For } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchRooms } from "../api";
import { Button } from "@ui/Button";
import { Select } from "@ui/Field";

export default function RoomCardConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const [room, setRoom] = createSignal(String(props.config.room ?? ""));

  const [rooms] = createQueryResource(
    "chat-rooms",
    () => nick() || null,
    async (n) => (await fetchRooms(n)).rooms,
  );

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_room")}
        <Select size="sm" class="mt-1 w-full" value={room()} onChange={(e) => setRoom(e.currentTarget.value)}>
          <option value="">—</option>
          <For each={rooms() ?? []}>
            {(r) => <option value={String(r.id)}>{r.name}</option>}
          </For>
        </Select>
      </label>
      <Button
        size="sm"
        class="self-end"
        onClick={() => props.onSave({ room: Number(room()) })}
        disabled={!room()}
      >
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
