// Pomodoro timer (config: { work, break } minutes). Timer state is local to
// the session; the end timestamp (not a decrementing counter) is stored so
// browser tab throttling can't drift the clock. visitorVisible: false —
// this is a productivity tool for the page owner, not page content.

import { createSignal, onCleanup, onMount } from "solid-js";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Card } from "@ui/Card";

type Phase = "work" | "break";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function clampMin(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 120 ? Math.round(n) : fallback;
}

export default function PomodoroWidget(props: WidgetProps) {
  const { t } = useI18n();
  const workMin = () => clampMin(props.config?.work, 25);
  const breakMin = () => clampMin(props.config?.break, 5);
  const durationMs = (phase: Phase) => (phase === "work" ? workMin() : breakMin()) * 60000;

  const [phase, setPhase] = createSignal<Phase>("work");
  const [endsAt, setEndsAt] = createSignal<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = createSignal<number | null>(null);
  const [now, setNow] = createSignal(Date.now());

  const running = () => endsAt() !== null;

  onMount(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const e = endsAt();
      if (e !== null && e - Date.now() <= 0) {
        if (phase() === "work") {
          // Work done — break starts by itself
          toast.success(t("widgets.pomo_break_time"));
          setPhase("break");
          setEndsAt(Date.now() + durationMs("break"));
        } else {
          // Break done — wait for the user to start the next round
          toast.success(t("widgets.pomo_work_time"));
          setPhase("work");
          setEndsAt(null);
        }
      }
    }, 500);
    onCleanup(() => clearInterval(id));
  });

  const remainingMs = () => {
    const e = endsAt();
    if (e !== null) return Math.max(0, e - now());
    return pausedRemaining() ?? durationMs(phase());
  };

  const display = () => {
    const s = Math.ceil(remainingMs() / 1000);
    return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  };

  const progress = () => 100 - (remainingMs() / durationMs(phase())) * 100;

  const startPause = () => {
    if (running()) {
      setPausedRemaining(remainingMs());
      setEndsAt(null);
    } else {
      setEndsAt(Date.now() + remainingMs());
      setPausedRemaining(null);
    }
  };

  const reset = () => {
    setPhase("work");
    setEndsAt(null);
    setPausedRemaining(null);
  };

  return (
    <Card class="px-4 py-4 text-center">
      <p
        class="text-xs font-medium mb-1"
        classList={{
          "text-accent": phase() === "break",
          "text-muted": phase() === "work",
        }}
      >
        {phase() === "work" ? t("widgets.pomo_work") : t("widgets.pomo_break")}
      </p>

      <p class="text-3xl font-semibold text-txt tabular-nums">{display()}</p>

      <div class="mt-2 h-1 rounded-full bg-elevated overflow-hidden">
        <div
          class="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${progress()}%` }}
        />
      </div>

      <div class="mt-3 flex items-center justify-center gap-2">
        <Button size="sm" onClick={startPause}>
          {running() ? t("widgets.pomo_pause") : t("widgets.pomo_start")}
        </Button>
        <Button variant="ghost" size="sm" onClick={reset}>
          {t("widgets.pomo_reset")}
        </Button>
      </div>
    </Card>
  );
}
