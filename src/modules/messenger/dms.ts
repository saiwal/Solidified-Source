// src/modules/messenger/dms.ts
// DM threads grouped into one conversation per set of people — a person can
// have several threads (subjects) with you, and Messenger lists them once.
import type { DmParticipant, MessageEntry } from "@utsukta/spa-core/lib/message-store";

export interface DmGroup {
  /** Sorted participant hashes, comma-joined: the url segment and the
   *  `xchan` filter that fetches this group's threads. */
  key: string;
  people: DmParticipant[];
  /** Newest activity first, as the feed returns them. */
  threads: MessageEntry[];
  unread: number;
}

// unseen_count is a number, or a placeholder string when only the thread's
// first message is unseen (see MessageEntry).
const unreadOf = (e: MessageEntry) =>
  typeof e.unseen_count === "number" ? e.unseen_count : e.unseen ? 1 : 0;

export function groupThreads(entries: MessageEntry[]): DmGroup[] {
  const groups = new Map<string, DmGroup>();
  for (const e of entries) {
    // No one else on it (a note to yourself), or cached before `participants`
    // existed: the author. Keyed by hash, since the key is also the `xchan`
    // filter that loads the conversation; the address is a last resort.
    const people = e.participants?.length
      ? [...e.participants].sort((a, b) => a.hash.localeCompare(b.hash))
      : [{ hash: e.author_hash || e.author_addr, name: e.author_name, addr: e.author_addr, url: "", photo: e.author_img }];
    const key = people.map((p) => p.hash).join(",");
    const g = groups.get(key) ?? { key, people, threads: [], unread: 0 };
    g.threads.push(e);
    g.unread += unreadOf(e);
    groups.set(key, g);
  }
  return [...groups.values()];
}

export const groupName = (g: DmGroup) => g.people.map((p) => p.name).join(", ");

/** Search box: a person's name or address. */
export const groupMatches = (g: DmGroup, q: string) =>
  !q || g.people.some((p) => `${p.name} ${p.addr}`.toLowerCase().includes(q.toLowerCase()));

/** Server-local "YYYY-MM-DD HH:MM:SS" (hq-messages) → time today, else a date. */
export function shortTime(created: string, locale: string): string {
  const d = new Date(created.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}
