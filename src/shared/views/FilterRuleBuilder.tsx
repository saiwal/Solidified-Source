import { For, Index, Show, createSignal, createEffect, batch } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  parse, compile, FIELD_OPS, CORE_FIELDS,
  type FilterRules, type FilterField, type FilterOp,
} from "@utsukta/spa-core/lib/filter-dsl";
import { MdOutlineClose, MdOutlineAdd } from "solid-icons/md";
import SuggestInput from "./SuggestInput";
import { Button, IconButton } from "@ui/Button";
import { Select, Textarea } from "@ui/Field";

const textClass = `flex-1 min-w-[8rem] px-2.5 py-1.5 rounded-lg border border-rim bg-surface text-txt text-sm
  placeholder:text-muted hover:border-rim-strong focus:outline-none focus:border-rim-strong transition-colors`;

/**
 * Structured editor over one message-filter expression (the include or the
 * exclude box). The parent owns the string; we parse it into rows and compile
 * back on every edit.
 *
 * When the string can't be represented as rows — a mix of `&&` and newline, a
 * precedence trap the flat evaluator doesn't support — we lock into the raw
 * textarea rather than rewriting what the user typed elsewhere.
 */
export default function FilterRuleBuilder(props: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  /** Fields to offer. Defaults to the ones core can evaluate at delivery —
   *  pass ALL_FIELDS only where the SPA evaluates the rule itself. */
  fields?: FilterField[];
  /** Per-field value suggestions, shown in SuggestInput's themed panel. */
  suggest?: Partial<Record<FilterField, string[]>>;
}) {
  const { t } = useI18n();

  const fields = () => props.fields ?? CORE_FIELDS;
  const [rules, setRules] = createSignal<FilterRules>({ join: "any", conds: [] });
  const [raw, setRaw] = createSignal(false);
  const [locked, setLocked] = createSignal(false);
  let emitted = "";

  // Re-seed only on changes that didn't come from us (initial load, async fetch).
  createEffect(() => {
    const v = props.value ?? "";
    if (v === emitted) return;
    emitted = v;
    const parsed = parse(v);
    batch(() => {
      setLocked(!parsed);
      if (!parsed) setRaw(true);
      else setRules(parsed);
    });
  });

  const emit = (r: FilterRules) => {
    setRules(r);
    emitted = compile(r);
    props.onChange(emitted);
  };

  const patch = (i: number, next: Partial<{ field: FilterField; op: FilterOp; value: string }>) => {
    const conds = rules().conds.map((c, idx) => {
      if (idx !== i) return c;
      const merged = { ...c, ...next };
      // Switching field can orphan the operator (e.g. `count` on a category).
      if (next.field && !FIELD_OPS[merged.field].includes(merged.op)) merged.op = "is";
      return merged;
    });
    emit({ ...rules(), conds });
  };

  return (
    <div class="space-y-2">
      <Show
        when={!raw()}
        fallback={
          <Textarea class="w-full resize-y font-mono" rows={props.rows ?? 4} value={props.value} onInput={(e) => {
              emitted = e.currentTarget.value;
              props.onChange(emitted);
              setLocked(!parse(emitted));
            }} />
        }
      >
        <Show when={rules().conds.length > 1}>
          <label class="flex items-center gap-2 text-xs text-muted">
            {t("filters.match_label")}
            <Select
              value={rules().join}
              onChange={(e) => emit({ ...rules(), join: e.currentTarget.value as "any" | "all" })}
            >
              <option value="any">{t("filters.match_any")}</option>
              <option value="all">{t("filters.match_all")}</option>
            </Select>
          </label>
        </Show>

        {/* Index, not For: every edit rebuilds the condition objects, so a keyed
            For would tear down the row being typed in and drop focus after each
            keystroke. Index keys by position, so the inputs survive. */}
        <Index each={rules().conds}>
          {(c, i) => (
            <div class="flex flex-wrap items-center gap-2">
              <Select
                value={c().field}
                onChange={(e) => patch(i, { field: e.currentTarget.value as FilterField })}
              >
                <For each={fields()}>
                  {(f) => <option value={f}>{t(`filters.field_${f}` as any)}</option>}
                </For>
              </Select>

              <Show when={FIELD_OPS[c().field].length > 1}>
                <Select value={c().op} onChange={(e) => patch(i, { op: e.currentTarget.value as FilterOp })}>
                  <For each={FIELD_OPS[c().field]}>
                    {(o) => <option value={o}>{t(`filters.op_${o}` as any)}</option>}
                  </For>
                </Select>
              </Show>

              <Show when={c().op !== "any"}>
                <SuggestInput
                  type={c().field === "until" ? "date" : c().op === "count" ? "number" : "text"}
                  min={c().op === "count" ? 1 : undefined}
                  value={c().value}
                  items={props.suggest?.[c().field] ?? []}
                  placeholder={t(`filters.ph_${c().op === "count" ? "count" : c().field}` as any)}
                  onInput={(v) => patch(i, { value: v })}
                  class={textClass}
                />
              </Show>

              <IconButton
                label={t("filters.remove")}
                size="sm"
                onClick={() => emit({ ...rules(), conds: rules().conds.filter((_, idx) => idx !== i) })}
              >
                <MdOutlineClose size={16} />
              </IconButton>
            </div>
          )}
        </Index>

        <Show when={!rules().conds.length}>
          <p class="text-xs text-muted">{t("filters.none")}</p>
        </Show>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => emit({ ...rules(), conds: [...rules().conds, { field: fields()[0], op: FIELD_OPS[fields()[0]][0], value: "" }] })}
        >
          <MdOutlineAdd size={14} />
          {t("filters.add_condition")}
        </Button>
      </Show>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={locked() && !raw()}
          onClick={() => setRaw(!raw())}
          class="text-xs text-accent hover:underline disabled:opacity-40 disabled:no-underline"
        >
          {raw() ? t("filters.edit_as_rules") : t("filters.edit_as_text")}
        </button>
        <Show when={locked() && raw()}>
          <span class="text-[0.625rem] text-muted">{t("filters.raw_only")}</span>
        </Show>
      </div>
    </div>
  );
}
