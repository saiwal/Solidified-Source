// src/modules/chat/notify.ts
// Per-room new-message alerts for chat windows: a chime, a browser
// notification ("push"), or nothing. Remembered per room in localStorage.
import { persistedSignal } from "@utsukta/spa-core/lib/persisted";
import { desktopNotifySupported } from "@utsukta/spa-core/lib/desktopNotify";

export type ChatNotifyMode = "sound" | "push" | "silent";
export const NEXT_MODE: Record<ChatNotifyMode, ChatNotifyMode> = {
  sound: "push",
  push: "silent",
  silent: "sound",
};

const [modes, setModes] = persistedSignal<Record<string, ChatNotifyMode>>(
  "hz-chat-notify",
  {},
  (raw) => {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : undefined;
  },
  JSON.stringify,
);

const key = (nick: string, roomId: number) => `${nick}:${roomId}`;

export const chatNotifyMode = (nick: string, roomId: number): ChatNotifyMode =>
  modes()[key(nick, roomId)] ?? "silent";

/**
 * Advance to the next mode. Called from the toggle's click, which is the user
 * gesture both the AudioContext and the permission prompt need. Push is
 * skipped when the browser can't or won't show notifications.
 */
export async function cycleChatNotify(nick: string, roomId: number): Promise<ChatNotifyMode> {
  let next = NEXT_MODE[chatNotifyMode(nick, roomId)];
  if (next === "sound") void audio()?.resume();
  if (next === "push") {
    let perm: NotificationPermission = desktopNotifySupported() ? Notification.permission : "denied";
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") next = NEXT_MODE.push;
  }
  setModes({ ...modes(), [key(nick, roomId)]: next });
  return next;
}

let ctx: AudioContext | undefined;
function audio(): AudioContext | undefined {
  try {
    return (ctx ??= new AudioContext());
  } catch {
    return undefined;
  }
}

/** A short two-note chime, synthesised so there is no asset to ship. */
function chime(): void {
  const ac = audio();
  if (!ac) return;
  // Starts suspended after a reload; resume() succeeds once the page has had
  // any user interaction, and quietly fails before that.
  if (ac.state !== "running") {
    ac.resume().then(() => { if (ac.state === "running") chime(); }, () => {});
    return;
  }
  const t0 = ac.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const t = t0 + i * 0.12;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

export function alertNewMessage(
  mode: ChatNotifyMode,
  opts: { title: string; body: string; icon?: string; onClick: () => void },
): void {
  if (mode === "sound") chime();
  else if (mode === "push" && desktopNotifySupported() && Notification.permission === "granted") {
    try {
      const n = new Notification(opts.title, { body: opts.body, icon: opts.icon, tag: `chat:${opts.title}` });
      n.onclick = () => {
        window.focus();
        opts.onClick();
        n.close();
      };
    } catch {
      // the constructor throws on some platforms (e.g. Android Chrome)
    }
  }
}
