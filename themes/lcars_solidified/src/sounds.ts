// LCARS beeps, mapped the way the classic `lcars` theme uses them:
//   1 — opening/closing a menu or panel (anything with aria-expanded/-haspopup)
//   2 — navigating (a link)
//   3 — a primary action (.hz-btn-primary)
//   4 — scroll to top, logout
// One capturing click listener reads the clicked control, so solidified's
// markup needs no hooks. Text inside posts and editors stays silent.
// On/off is per device (localStorage); it defaults to on only where the
// toggle (the bottom elbow, desktop-only) is visible.
import { createSignal } from "solid-js";
import beep1 from "./sounds/beep1.mp3";
import beep2 from "./sounds/beep2.mp3";
import beep3 from "./sounds/beep3.mp3";
import beep4 from "./sounds/beep4.mp3";

type Beep = 1 | 2 | 3 | 4;
const KEY = "hz-lcars-sound";

function initial(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) return v === "1";
  } catch { /* storage blocked: fall through */ }
  return window.matchMedia("(min-width: 1024px)").matches;
}

const [soundOn, setSound] = createSignal(initial());
export { soundOn };

export function toggleSound(): void {
  setSound((on) => !on);
  try { localStorage.setItem(KEY, soundOn() ? "1" : "0"); } catch { /* ignore */ }
  if (soundOn()) beep(1);
}

let clips: HTMLAudioElement[] | null = null;

export function beep(n: Beep): void {
  if (!soundOn()) return;
  clips ??= [beep1, beep2, beep3, beep4].map((src) => {
    const a = new Audio(src);
    a.preload = "auto";
    return a;
  });
  const a = clips[n - 1];
  a.currentTime = 0;
  // Autoplay rules can still refuse; a missing beep is fine.
  void a.play().catch(() => {});
}

function pick(target: EventTarget | null): Beep | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("a[href], button, [role='button'], [role='menuitem'], [role='tab']");
  if (!el || el.closest(".prose, [contenteditable='true'], .hz-lcars-sound")) return null;
  if (el.matches("a[href*='logout']")) return 4;
  if (el.matches("[aria-expanded], [aria-haspopup]")) return 1;
  if (el.matches("a[href]")) return 2;
  if (el.matches(".hz-btn-primary")) return 3;
  return null;
}

document.addEventListener("click", (e) => {
  const n = pick(e.target);
  if (n) beep(n);
}, { capture: true });
