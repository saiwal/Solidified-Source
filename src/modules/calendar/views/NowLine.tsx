import { createSignal, onCleanup } from "solid-js";
import { HOUR_H } from "./calUtils";

const nowY = () => {
  const n = new Date();
  return (n.getHours() + n.getMinutes() / 60) * HOUR_H;
};

/**
 * The calendar's one lit moment: an accent line across today's column at the
 * current time, gliding down as the minutes tick (instant under reduced motion).
 */
export default function NowLine() {
  const [y, setY] = createSignal(nowY());
  const timer = setInterval(() => setY(nowY()), 60_000);
  onCleanup(() => clearInterval(timer));
  return (
    <div
      class="absolute left-0 right-0 z-10 pointer-events-none transition-[top] duration-1000 ease-linear motion-reduce:transition-none"
      style={{ top: `${y()}px` }}
      aria-hidden="true"
    >
      <div class="absolute -left-1 -top-[5px] w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-base" />
      <div class="h-0.5 -mt-px bg-accent rounded-full" />
    </div>
  );
}
