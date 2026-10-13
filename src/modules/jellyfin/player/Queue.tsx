// The play queue: drag to reorder, tap to jump, × to remove. No boxes —
// the playing row is marked by colour alone.
import { For, Show } from "solid-js";
import { MdFillClose, MdOutlineDrag_indicator, MdFillMusic_note } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createDragReorder } from "@utsukta/spa-core/lib/useDragReorder";
import { ticksToSeconds } from "../api";
import { queue, current, playAt, removeFromQueue, reorderQueue, type QItem } from "../store";
import { fmtTime } from "../ui";

export default function Queue() {
  const { t } = useI18n();
  const drag = createDragReorder<QItem>(queue, (q) => q.qid, reorderQueue);
  return (
    <ol class="space-y-0.5">
      <For each={drag.displayItems()}>
        {(q) => {
          const isCur = () => q.qid === current()?.qid;
          const pos = () => queue().indexOf(q);
          return (
            <li ref={drag.registerRef(q.qid)}
              class={`group flex items-center gap-1 rounded-xl pr-1 transition-colors ${isCur() ? "bg-elevated/60" : "hover:bg-elevated/40"} ${drag.draggingKey() === q.qid ? "opacity-50" : ""}`}>
              <span role="button" tabindex="-1" aria-label={t("jellyfin.drag_reorder")} title={t("jellyfin.drag_reorder")}
                onPointerDown={(e) => { e.preventDefault(); drag.beginDrag(q); }}
                class="pl-2 py-3 text-muted/50 group-hover:text-muted cursor-grab active:cursor-grabbing touch-none">
                <MdOutlineDrag_indicator size={16} />
              </span>
              <button type="button" onClick={() => playAt(pos())} class="flex flex-1 min-w-0 items-center gap-3 py-2 text-left">
                <span class="w-5 shrink-0 text-right text-xs text-muted tabular-nums">
                  <Show when={isCur()} fallback={pos() + 1}><MdFillMusic_note size={14} class="inline text-accent-txt" /></Show>
                </span>
                <span class="min-w-0 flex-1">
                  <span class={`block text-sm truncate ${isCur() ? "text-accent-txt" : "text-txt"}`}>{q.Name}</span>
                  <span class="block text-xs text-muted truncate">{q.Artists?.join(", ") || q.AlbumArtist}</span>
                </span>
                <span class="shrink-0 text-xs text-muted tabular-nums">{fmtTime(ticksToSeconds(q.RunTimeTicks))}</span>
              </button>
              <button type="button" title={t("jellyfin.remove_from_queue")} onClick={() => removeFromQueue(q.qid)}
                class="p-1.5 rounded-full text-muted/50 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-txt transition-opacity max-md:opacity-100">
                <MdFillClose size={14} />
              </button>
            </li>
          );
        }}
      </For>
    </ol>
  );
}
