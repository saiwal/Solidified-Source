import { For, type Component } from "solid-js";
import {
  MdFillApps,
  MdFillFormat_list_bulleted, MdFillShort_text, MdFillTimeline,
} from "solid-icons/md";
import type { ViewMode } from "@/shared/stream/types";
import { useI18n } from "@utsukta/spa-core/i18n";

type IconType = Component<{ size?: number; class?: string }>;

const ALL_VIEWS: { id: ViewMode; key: string; icon: IconType }[] = [
  { id: "feed",    key: "feed", icon: MdFillShort_text },
  { id: "masonry", key: "grid", icon: MdFillApps },
  { id: "list",    key: "list", icon: MdFillFormat_list_bulleted },
  { id: "timeline", key: "timeline", icon: MdFillTimeline },
];

export default function ViewSwitcher(props: {
  viewMode: ViewMode;
  onChange: (v: ViewMode) => void;
  available?: ViewMode[];
}) {
  const { t } = useI18n();
  const views = () =>
    props.available
      ? ALL_VIEWS.filter((v) => props.available!.includes(v.id))
      : ALL_VIEWS;

  return (
    <div class="flex rounded-lg border border-rim overflow-hidden shrink-0"
      role="group" aria-label="View mode">
      <For each={views()}>
        {(v) => (
          <button
            title={t(`network.${v.key}` as any)}
            aria-pressed={props.viewMode === v.id}
            onClick={() => props.onChange(v.id)}
            class={`px-2 py-1.5 transition-colors
              ${props.viewMode === v.id
                ? "bg-elevated text-txt"
                : "bg-surface text-muted hover:bg-elevated hover:text-txt"}`}
          >
            <v.icon size={15} />
          </button>
        )}
      </For>
    </div>
  );
}
