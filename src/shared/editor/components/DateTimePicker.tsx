import { createSignal, createMemo, For, Show, onCleanup, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { MdOutlineSchedule } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";

interface Props {
  /** "" or local "YYYY-MM-DDTHH:mm" (same contract as <input type="datetime-local">) */
  value: string;
  onChange: (v: string) => void;
  /** Earliest selectable moment (default: none) */
  min?: () => Date | null;
  /** Icon shown on the trigger button */
  icon?: JSX.Element;
  title?: string;
  placeholder?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseValue(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * Compact date+time picker where both the date AND the time are selected by
 * clicking — replaces <input type="datetime-local">, whose time half is
 * type-only in several browsers. Calendar on the left, hour/minute columns
 * (5-minute steps) on the right. Emits datetime-local strings.
 */
export default function DateTimePicker(props: Props) {
  const { t, locale } = useI18n();
  const [open, setOpen] = createSignal(false);
  const selected = createMemo(() => parseValue(props.value));
  const [viewMonth, setViewMonth] = createSignal(startOfMonth(selected() ?? new Date()));
  // Trigger rect at open time — the popup renders in a body Portal with fixed
  // positioning so overflow-hidden/scroll ancestors (modals) can't crop it.
  const [anchor, setAnchor] = createSignal<DOMRect | null>(null);
  let rootRef: HTMLDivElement | undefined;
  let popupRef: HTMLDivElement | undefined;

  function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  const minDate = () => props.min?.() ?? null;

  // ── Display formatting (locale-aware) ─────────────────────────────────────
  const fmtTrigger = createMemo(() =>
    new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }),
  );
  const fmtMonth = createMemo(() =>
    new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }),
  );
  const weekdays = createMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale(), { weekday: "narrow" });
    // 2024-01-01 is a Monday — week rows start on Monday
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  });

  // ── Calendar grid for the viewed month ────────────────────────────────────
  const days = createMemo(() => {
    const first = viewMonth();
    const lead = (first.getDay() + 6) % 7; // Monday-based offset
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: count }, (_, i) =>
        new Date(first.getFullYear(), first.getMonth(), i + 1)),
    ];
  });

  function dayDisabled(d: Date): boolean {
    const min = minDate();
    if (!min) return false;
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
    return endOfDay < min;
  }

  // Base date+time used when the user's first click is a day / hour / minute.
  // Defaults the time to the next full hour so a fresh pick is never below min.
  function base(): Date {
    const sel = selected();
    if (sel) return sel;
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  }

  function clampToMin(d: Date): Date {
    const min = minDate();
    return min && d < min ? new Date(min.getTime() + 60000) : d;
  }

  function pickDay(d: Date) {
    const b = base();
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), b.getHours(), b.getMinutes());
    props.onChange(toValue(clampToMin(next)));
  }

  function pickHour(h: number) {
    const b = base();
    b.setHours(h);
    props.onChange(toValue(clampToMin(b)));
  }

  function pickMinute(m: number) {
    const b = base();
    b.setMinutes(m);
    props.onChange(toValue(clampToMin(b)));
  }

  function hourDisabled(h: number): boolean {
    const min = minDate();
    const sel = selected();
    if (!min || !sel || !sameDay(sel, min)) return false;
    return h < min.getHours();
  }

  function minuteDisabled(m: number): boolean {
    const min = minDate();
    const sel = selected();
    if (!min || !sel || !sameDay(sel, min) || sel.getHours() !== min.getHours()) return false;
    return m <= min.getMinutes();
  }

  // ── Open/close ─────────────────────────────────────────────────────────────
  function onDocDown(e: MouseEvent) {
    const target = e.target as Node;
    if (rootRef?.contains(target) || popupRef?.contains(target)) return;
    setOpen(false);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  }
  function toggle() {
    const next = !open();
    if (next) setAnchor(rootRef?.getBoundingClientRect() ?? null);
    setOpen(next);
    if (next) {
      setViewMonth(startOfMonth(selected() ?? new Date()));
      document.addEventListener("mousedown", onDocDown);
      document.addEventListener("keydown", onKey, true);
    } else {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey, true);
    }
  }

  // Prefer opening above the trigger (as before); flip below when cramped.
  // Approximate popup size — only used for viewport-edge decisions.
  const POP_W = 384;
  const POP_H = 220;
  const popupStyle = () => {
    const r = anchor();
    if (!r) return "position:fixed;z-index:9999";
    const margin = 6;
    let right = Math.max(8, window.innerWidth - r.right);
    right = Math.min(right, Math.max(8, window.innerWidth - POP_W - 8));
    const vertical = r.top > POP_H + margin + 8
      ? `bottom:${window.innerHeight - r.top + margin}px`
      : `top:${r.bottom + margin}px`;
    return `position:fixed;z-index:9999;right:${right}px;${vertical}`;
  };
  onCleanup(() => {
    document.removeEventListener("mousedown", onDocDown);
    document.removeEventListener("keydown", onKey, true);
  });

  const colBtn = (active: boolean, disabled: boolean) =>
    "w-full px-1.5 py-0.5 text-[0.6875rem] tabular-nums rounded transition-colors " +
    (disabled
      ? "text-muted/30 cursor-default"
      : active
        ? "bg-accent text-accent-fg"
        : "text-txt hover:bg-elevated cursor-pointer");

  return (
    <div ref={rootRef} class="relative">
      {/* Trigger */}
      <button
        type="button"
        title={props.title}
        onClick={toggle}
        class={
          "flex items-center gap-1.5 px-2.5 py-1.5 sm:px-2 sm:py-1 rounded-md text-xs border transition-colors " +
          (props.value || open()
            ? "bg-accent/10 text-accent border-accent/30"
            : "text-muted hover:text-txt hover:bg-elevated border-rim")
        }
      >
        <span class="shrink-0">{props.icon ?? <MdOutlineSchedule size={14} />}</span>
        <Show when={selected()} fallback={<span class="hidden sm:inline">{props.placeholder ?? props.title}</span>}>
          <span class="tabular-nums">{fmtTrigger().format(selected()!)}</span>
        </Show>
      </button>

      {/* Popup — body Portal so modal overflow can't crop it */}
      <Show when={open()}>
        <Portal mount={document.body}>
        <div
          ref={popupRef}
          style={popupStyle()}
          class="flex gap-2 p-2.5 rounded-xl
                 border border-rim bg-surface shadow-xl select-none"
        >
          {/* Calendar */}
          <div class="w-52">
            <div class="flex items-center justify-between mb-1.5">
              <button
                type="button"
                onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                class="p-1 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
              >‹</button>
              <span class="text-xs font-medium text-txt capitalize">
                {fmtMonth().format(viewMonth())}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                class="p-1 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
              >›</button>
            </div>
            <div class="grid grid-cols-7 gap-0.5 text-center">
              <For each={weekdays()}>
                {(w) => <span class="text-[0.625rem] text-muted/60 py-0.5">{w}</span>}
              </For>
              <For each={days()}>
                {(d) => (
                  <Show when={d} fallback={<span />}>
                    <button
                      type="button"
                      disabled={dayDisabled(d!)}
                      onClick={() => pickDay(d!)}
                      class={
                        "py-0.5 text-[0.6875rem] tabular-nums rounded transition-colors " +
                        (dayDisabled(d!)
                          ? "text-muted/30 cursor-default"
                          : selected() && sameDay(selected()!, d!)
                            ? "bg-accent text-accent-fg"
                            : sameDay(d!, new Date())
                              ? "text-accent hover:bg-elevated"
                              : "text-txt hover:bg-elevated")
                      }
                    >
                      {d!.getDate()}
                    </button>
                  </Show>
                )}
              </For>
            </div>
          </div>

          {/* Time columns */}
          <div class="flex gap-1 border-l border-rim pl-2">
            <div class="h-44 w-9 overflow-y-auto pr-0.5 space-y-0.5">
              <For each={Array.from({ length: 24 }, (_, h) => h)}>
                {(h) => (
                  <button
                    type="button"
                    disabled={hourDisabled(h)}
                    onClick={() => pickHour(h)}
                    class={colBtn(selected()?.getHours() === h, hourDisabled(h))}
                  >
                    {pad(h)}
                  </button>
                )}
              </For>
            </div>
            <div class="h-44 w-9 overflow-y-auto pr-0.5 space-y-0.5">
              <For each={Array.from({ length: 12 }, (_, i) => i * 5)}>
                {(m) => (
                  <button
                    type="button"
                    disabled={minuteDisabled(m)}
                    onClick={() => pickMinute(m)}
                    class={colBtn(selected()?.getMinutes() === m, minuteDisabled(m))}
                  >
                    {pad(m)}
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* Footer actions */}
          <div class="flex flex-col justify-end gap-1">
            <Show when={props.value}>
              <button
                type="button"
                onClick={() => props.onChange("")}
                class="px-2 py-1 text-[0.6875rem] rounded border border-rim text-muted
                       hover:text-red-500 hover:border-red-400/50 transition-colors"
              >
                {t("editor.dtp_clear")}
              </button>
            </Show>
            <button
              type="button"
              onClick={toggle}
              class="px-2 py-1 text-[0.6875rem] rounded bg-accent text-accent-fg hover:opacity-90 transition-opacity"
            >
              {t("editor.dtp_done")}
            </button>
          </div>
        </div>
        </Portal>
      </Show>
    </div>
  );
}
