// Type chips + tag + date range for unified search (palette and drawer).
import { For } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Chip } from "@ui/Chip";
import { Input } from "@ui/Field";
import { FIND_TYPES, type FindFilters, type FindType } from "./search";

export default function SearchFilters(props: { value: FindFilters; onChange: (f: FindFilters) => void }) {
  const { t } = useI18n();
  const set = (patch: Partial<FindFilters>) => props.onChange({ ...props.value, ...patch });
  const toggle = (ty: FindType) => {
    const on = props.value.types.includes(ty);
    set({ types: on ? props.value.types.filter((x) => x !== ty) : [...props.value.types, ty] });
  };

  return (
    <div class="space-y-2">
      <div class="flex flex-wrap gap-1.5" role="group" aria-label={t("layout.palette_content")}>
        <Chip size="sm" selected={props.value.types.length === 0} onClick={() => set({ types: [] })}>
          {t("layout.palette_all")}
        </Chip>
        <For each={FIND_TYPES}>
          {(ty) => (
            <Chip size="sm" selected={props.value.types.includes(ty)} onClick={() => toggle(ty)}>
              {t(`layout.palette_type_${ty}`)}
            </Chip>
          )}
        </For>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
        <label class="flex items-center gap-1.5 min-w-0">
          {t("layout.palette_tag")}
          <Input class="w-28" value={props.value.tag} placeholder="#"
            onInput={(e) => set({ tag: e.currentTarget.value })} />
        </label>
        <label class="flex items-center gap-1.5">
          {t("layout.palette_from")}
          <Input type="date" class="w-36" value={props.value.dbegin}
            onInput={(e) => set({ dbegin: e.currentTarget.value })} />
        </label>
        <label class="flex items-center gap-1.5">
          {t("layout.palette_to")}
          <Input type="date" class="w-36" value={props.value.dend}
            onInput={(e) => set({ dend: e.currentTarget.value })} />
        </label>
      </div>
    </div>
  );
}
