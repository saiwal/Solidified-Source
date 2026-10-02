import { Show, createSignal } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";
import { openChat } from "@/shared/views/modal-host";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { isOwner } from "../store";
import NewRoomForm from "../NewRoomForm";
import {
  MdFillAdd,
} from "solid-icons/md";

export default function ChatHeaderWidget() {
  const { t } = useI18n();
  const owner = usePageOwnerName();
  const nick = usePageNick();

  const [showForm, setShowForm] = createSignal(false);

  return (
    <>
      <div class="max-w-5xl mx-auto space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-semibold text-txt">{owner() === null ? t("chat.title_mine") : t("chat.title_of", { name: owner()! })}</h1>
          </div>
          <Show when={isOwner()}>
            <button
              onClick={() => setShowForm((v) => !v)}
              class="flex items-center gap-1.5 text-sm border border-rim text-muted hover:bg-elevated hover:text-txt rounded-lg px-3 py-1.5 transition-colors"
            >
              <MdFillAdd class="text-base" />
              {t("chat.new_room")}
            </button>
          </Show>
        </div>

        <Show when={showForm()}>
          <NewRoomForm
            nick={nick()}
            onCreated={(room) => { setShowForm(false); openChat(nick(), room.id, room.name); }}
            onCancel={() => setShowForm(false)}
          />
        </Show>
      </div>
    </>
  );
}
