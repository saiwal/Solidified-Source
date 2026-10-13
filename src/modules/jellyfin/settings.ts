// Player settings that aren't about playback:
//  - who sees "now playing" on the profile — stored on the hub (it gates what
//    the hub serves to visitors), see Handlers/JellyfinNowPlaying.php;
//  - the daily recap reminder — per browser, like the rest of the player.
import { createSignal } from "solid-js";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";

export type Audience = "off" | "self" | "connections" | "public";

const [audience, setAudienceSignal] = createSignal<Audience>("off");
const [audienceLoaded, setAudienceLoaded] = createSignal(false);
export { audience, audienceLoaded };

let loading: Promise<void> | null = null;
/** Fetch the owner's audience once per page load. */
export function loadAudience(): Promise<void> {
  loading ??= apiFetch("/spa/jellyfin-nowplaying")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j?.data?.audience) setAudienceSignal(j.data.audience);
      setAudienceLoaded(true);
    })
    .catch(() => { loading = null; });
  return loading;
}

export async function setAudience(a: Audience): Promise<boolean> {
  const prev = audience();
  setAudienceSignal(a);
  const r = await apiFetch("/spa/jellyfin-nowplaying", { method: "POST", body: JSON.stringify({ audience: a }) }).catch(() => null);
  if (!r?.ok) setAudienceSignal(prev);
  return !!r?.ok;
}

// ── Daily recap reminder ──────────────────────────────────────────────────────

const REMINDER_KEY = "hz-jellyfin-recap";

interface Reminder { enabled: boolean; hour: number; lastPrompt: string }

function loadReminder(): Reminder {
  try {
    const r = JSON.parse(localStorage.getItem(REMINDER_KEY) ?? "{}");
    return { enabled: !!r.enabled, hour: Number.isInteger(r.hour) ? r.hour : 21, lastPrompt: String(r.lastPrompt ?? "") };
  } catch {
    return { enabled: false, hour: 21, lastPrompt: "" };
  }
}

const [reminder, setReminderSignal] = createSignal<Reminder>(loadReminder());
export { reminder };

export function setReminder(patch: Partial<Reminder>): void {
  const next = { ...reminder(), ...patch };
  setReminderSignal(next);
  try { localStorage.setItem(REMINDER_KEY, JSON.stringify(next)); } catch { /* per-session only */ }
}

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

/** True once a day, at or after the chosen hour, while enabled. Marks it as prompted. */
export function reminderDue(): boolean {
  const r = reminder();
  if (!r.enabled || new Date().getHours() < r.hour || r.lastPrompt === today()) return false;
  setReminder({ lastPrompt: today() });
  return true;
}

/** Settings panel open on /jellyfin (toggled by the header's gear). */
const [settingsOpen, setSettingsOpen] = createSignal(false);
export { settingsOpen, setSettingsOpen };
