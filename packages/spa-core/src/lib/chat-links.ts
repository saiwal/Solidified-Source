// Matrix / Delta Chat address validation — mirrors Api/ChatAddresses.php
// normalize() (keep the two in step; the server is the authority, this only
// lets editors and the address book link without a round-trip).
// Docs: src/docs/dev/en/4-features/chat-apps.md

export type ChatType = "matrix" | "deltachat";
export interface ChatAddress {
  type: ChatType;
  value: string;
  href: string;
  /** Only on server results: where it came from. private/addressbook are yours alone. */
  source?: "private" | "addressbook" | "profile" | "actor";
}

const MXID = /^@[a-z0-9._=\-/+]+:[a-z0-9.-]+(?::\d{1,5})?$/i;
const DC_INVITE = /^https:\/\/i\.delta\.chat\/#[^\s"'<>]+$/;
const EMAIL = /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/;

export function normalizeChat(type: string, raw: string): ChatAddress | null {
  let v = raw.trim();
  if (type === "matrix") {
    v = v.replace(/^https:\/\/matrix\.to\/#\//, "");
    if (v.startsWith("matrix:u/")) v = "@" + v.slice(9);
    v = v.replace(/\?.*$/, "");
    return MXID.test(v) ? { type, value: v, href: `https://matrix.to/#/${v}` } : null;
  }
  if (type === "deltachat") {
    if (DC_INVITE.test(v)) return { type, value: v, href: v };
    v = v.replace(/^mailto:/i, "");
    return EMAIL.test(v) ? { type, value: v, href: `mailto:${v}` } : null;
  }
  return null;
}

/** Type from a vCard IMPP TYPE label + value (same rule as the server's classify()). */
export function classifyChat(label: string, value: string): ChatAddress | null {
  if (/delta/i.test(label) || /^https:\/\/i\.delta\.chat\//.test(value.trim())) return normalizeChat("deltachat", value);
  return normalizeChat("matrix", value);
}

export const CHAT_LABEL: Record<ChatType, string> = { matrix: "Matrix", deltachat: "Delta Chat" };
