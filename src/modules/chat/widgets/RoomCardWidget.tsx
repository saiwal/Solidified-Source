// Chatroom card (config: { room }): room name, who's inside, join link.
// multiInstance.

import { Show } from "solid-js";
import { openChat } from "@/shared/views/modal-host";
import { createAsyncResource } from "@utsukta/spa-core/lib/createAsyncResource";
import AsyncBoundary from "@/shared/views/AsyncBoundary";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillChat } from "solid-icons/md";
import { fetchRooms } from "../api";
import { Button } from "@ui/Button";
import { Card } from "@ui/Card";
import { WidgetShell } from "@ui/WidgetShell";

function EditHint(props: { text: string }) {
  return (
    <Show when={editingWidgets()}>
      <Card class="px-(--ws-px) py-3">
        <p class="text-xs text-muted">{props.text}</p>
      </Card>
    </Show>
  );
}

export default function RoomCardWidget(props: WidgetProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const roomId = () => Number(props.config?.room ?? 0);

  const [room] = createAsyncResource(
    "chat-room",
    () => (nick() && roomId() ? { nick: nick(), id: roomId() } : null),
    async (p) => {
      const res = await fetchRooms(p.nick);
      return res.rooms.find((r) => r.id === p.id) ?? null;
    },
  );

  return (
    <Show when={roomId()} fallback={<EditHint text={t("widgets.not_configured")} />}>

      <AsyncBoundary
        fallback={
          <WidgetShell><div class="p-4 space-y-2 animate-pulse">
            <div class="h-3 bg-elevated rounded w-1/2" />
            <div class="h-3 bg-elevated rounded w-1/3" />
          </div></WidgetShell>
        }
        error={<EditHint text={t("widgets.item_unavailable")} />}
      >
        <Show when={room()} fallback={<EditHint text={t("widgets.item_unavailable")} />}>
          {(r) => (
            <WidgetShell>
              <div class="px-(--ws-px) py-3 flex items-center gap-2">
                <MdFillChat size={18} class="text-accent shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-txt truncate">{r().name}</p>
                  <p class="text-xs text-muted">
                    {r().in_room} {t("widgets.room_members")}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="w-full"
                onClick={() => openChat(nick(), r().id, r().name)}
              >
                {t("widgets.join_room")}
              </Button>
            </WidgetShell>
          )}
        </Show>
      </AsyncBoundary>
    </Show>
  );
}
