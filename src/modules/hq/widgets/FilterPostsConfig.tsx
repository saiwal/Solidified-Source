// Settings form for FilterPostsWidget: a preset, an optional group/forum
// scope, and the fields shared with SavedSearchPostsConfig (CommonFields).

import { createSignal, For } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchGroups } from "@/modules/directory/groups/api";
import { fetchConnectionPage } from "@/modules/network/api";
import { COUNTS, PRESETS, type CardConfig, type PresetKey } from "./FilteredPostsList";
import { Button } from "@ui/Button";
import { Select } from "@ui/Field";
import { Toggle } from "@ui/Toggle";

export function CommonFields(props: { value: CardConfig; onChange: (v: CardConfig) => void }) {
  const { t } = useI18n();
  return (
    <>
      <label class="text-xs text-muted">
        {t("widgets.cfg_count")}
        <Select size="sm" class="mt-1 w-full" value={String(props.value.count ?? 5)}
          onChange={(e) => props.onChange({ ...props.value, count: Number(e.currentTarget.value) })}>
          <For each={COUNTS}>{(n) => <option value={String(n)}>{n}</option>}</For>
        </Select>
      </label>
      <Toggle label={t("widgets.cfg_unseen_only")} checked={!!props.value.unseen}
        onChange={(on) => props.onChange({ ...props.value, unseen: on })} />
    </>
  );
}

export default function FilterPostsConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const [preset, setPreset] = createSignal((props.config.preset as PresetKey) ?? "");
  const [scope, setScope] = createSignal(String(props.config.scope ?? ""));
  const [common, setCommon] = createSignal<CardConfig>({ count: props.config.count as number, unseen: !!props.config.unseen });

  // Groups 404 when the Privacy Groups app isn't installed — just offer none.
  const [groups] = createQueryResource("privacy-groups", () => fetchGroups().catch(() => []));
  const [forums] = createQueryResource("hq-forum-scope", () => fetchConnectionPage("forum", 0, 100).then((r) => r.items));

  // The scope's display name is stored so the card title needs no lookup.
  const scopeLabel = () => {
    const [kind, id] = scope().split(":");
    const list = kind === "g" ? groups.latest : kind === "f" ? forums.latest : undefined;
    return list?.find((x) => String(x.id) === id)?.name;
  };

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_preset")}
        <Select size="sm" class="mt-1 w-full" value={preset()} onChange={(e) => setPreset(e.currentTarget.value as PresetKey)}>
          <For each={PRESETS}>{(p) => <option value={p.key}>{t(p.labelKey as "widgets.cfg_preset_all")}</option>}</For>
        </Select>
      </label>
      <label class="text-xs text-muted">
        {t("widgets.cfg_scope")}
        <Select size="sm" class="mt-1 w-full" value={scope()} onChange={(e) => setScope(e.currentTarget.value)}>
          <option value="">{t("widgets.cfg_scope_everyone")}</option>
          <optgroup label={t("network.privacy_groups")}>
            <For each={groups.latest ?? []}>{(g) => <option value={`g:${g.id}`} selected={scope() === `g:${g.id}`}>{g.name}</option>}</For>
          </optgroup>
          <optgroup label={t("network.forums")}>
            <For each={forums.latest ?? []}>{(f) => <option value={`f:${f.id}`} selected={scope() === `f:${f.id}`}>{f.name}</option>}</For>
          </optgroup>
        </Select>
      </label>
      <CommonFields value={common()} onChange={setCommon} />
      <Button size="sm" class="self-end"
        onClick={() => props.onSave({ ...common(), preset: preset(), scope: scope() || undefined, scopeLabel: scopeLabel() })}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
