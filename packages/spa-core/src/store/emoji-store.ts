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
