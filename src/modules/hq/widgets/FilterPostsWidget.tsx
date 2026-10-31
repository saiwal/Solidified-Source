// HQ card listing the newest posts for one stream filter preset (starred,
// followed threads, DMs…), optionally narrowed to a privacy group or forum.
// The config carries everything needed, so nothing is looked up at render.

import { useI18n } from "@utsukta/spa-core/i18n";
import { FilteredPostsList, PRESETS, type CardConfig, type PresetKey } from "./FilteredPostsList";

export type FilterConfig = CardConfig & {
  preset?: PresetKey;
  /** "g:<gid>" privacy group, "f:<cid>" forum, absent = everyone */
  scope?: string;
  scopeLabel?: string;
};

export function filterParams(c: FilterConfig): Record<string, string> {
  const p: Record<string, string> = {};
  if (c.preset) p[c.preset] = "1";
  const [kind, id] = (c.scope ?? "").split(":");
  if (kind === "g" && id) p.gid = id;
  if (kind === "f" && id) { p.cid = id; p.xchan_label = c.scopeLabel ?? ""; }
  if (c.unseen) p.unseen = "1";
  return p;
}

export default function FilterPostsWidget(props: { config?: FilterConfig }) {
  const { t } = useI18n();
  const c = () => props.config ?? {};
  const title = () => {
    const preset = PRESETS.find((p) => p.key === (c().preset ?? ""))!;
    const base = t(preset.labelKey as "widgets.cfg_preset_all");
    return c().scopeLabel ? `${base} · ${c().scopeLabel}` : base;
  };

  return <FilteredPostsList title={title()} params={filterParams(c())} count={c().count} />;
}
