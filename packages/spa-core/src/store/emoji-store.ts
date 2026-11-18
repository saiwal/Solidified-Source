import { createSignal } from 'solid-js';

export type EmojiEntry = { shortname: string; filepath: string };
export type EmojiMap = Record<string, EmojiEntry>;

// A signal, not a plain variable: posts render before this 100KB+ fetch
// lands, and sanitizeHtml() must re-run when it does or they keep raw
// :shortcodes: forever.
const [map, setMap] = createSignal<EmojiMap>({});

fetch('/smilies', { credentials: 'include' })
  .then(r => r.ok ? r.json() : {})
  .then((data: EmojiMap) => setMap(data))
  .catch(() => {});

export const getEmojiMap = map;

// Recently used shortnames, newest first. Per device (localStorage) — fed by
// both the toolbar picker and the inline `:` autocomplete.
const RECENT_KEY = 'hz-emoji-recent';
const RECENT_MAX = 24;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

const [recent, setRecent] = createSignal<string[]>(readRecent());
export const recentEmoji = recent;

export function addRecentEmoji(shortname: string) {
  const next = [shortname, ...recent().filter((s) => s !== shortname)].slice(0, RECENT_MAX);
  setRecent(next);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
}
