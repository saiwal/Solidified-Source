// src/modules/wiki/api.ts
import { apiFetch } from "@utsukta/spa-core/lib/fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

// Core's wiki addon offers a narrower format list than the generic item
// picker — no HTML — and mirrors it server-side in ContentTypes::WIKI.
// See Mod_Wiki.php:221.
export const WIKI_MIME_TYPES = ["text/bbcode", "text/markdown", "text/plain"] as const;
export type WikiMimeType = (typeof WIKI_MIME_TYPES)[number];

export const WIKI_MIME_LABEL = {
  "text/bbcode": "editor.format_bbcode",
  "text/markdown": "editor.format_markdown",
  "text/plain": "editor.format_plain",
} as const satisfies Record<WikiMimeType, string>;

export interface WikiMeta {
  resource_id: string;
  name: string;
  url_name: string;
  html_name: string;
  mime_type: WikiMimeType;
  type_lock: boolean;
  is_private?: boolean;
}

export interface WikiPage {
  name: string;
  url_name: string;
}

export interface WikiListResponse {
  wikis: WikiMeta[];
  is_owner: boolean;
  can_create: boolean;
}

export interface WikiPagesResponse {
  wiki: WikiMeta;
  pages: WikiPage[];
  can_write: boolean;
}

export interface WikiPageResponse {
  wiki: WikiMeta;
  page: { name: string; url_name: string; mime_type: string };
  raw: string;
  html: string;
  can_write: boolean;
  commit: string;
}

export interface PageHistoryEntry {
  revision: number;
  date: string;
  name: string;
  title: string;
}

export interface PageHistoryResponse {
  history: PageHistoryEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function wikiUrl(nick: string, ...segments: string[]): string {
  const parts = ["/spa/wiki", nick, ...segments].filter(Boolean);
  return parts.join("/");
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchWikis(nick: string): Promise<WikiListResponse> {
  const res = await apiFetch(wikiUrl(nick));
  if (!res.ok) throw new Error(`fetchWikis failed: ${res.status}`);
  const json = await res.json();
  return json.data as WikiListResponse;
}

export async function fetchWikiPages(
  nick: string,
  wikiUrlName: string,
): Promise<WikiPagesResponse> {
  const res = await apiFetch(wikiUrl(nick, wikiUrlName));
  if (!res.ok) throw new Error(`fetchWikiPages failed: ${res.status}`);
  const json = await res.json();
  return json.data as WikiPagesResponse;
}

export async function fetchWikiPage(
  nick: string,
  wikiUrlName: string,
  pageUrlName: string,
): Promise<WikiPageResponse> {
  const res = await apiFetch(wikiUrl(nick, wikiUrlName, pageUrlName));
  if (!res.ok) throw new Error(`fetchWikiPage ${res.status}`);
  const json = await res.json();
  return json.data as WikiPageResponse;
}

export async function createWiki(
  nick: string,
  payload: {
    name: string;
    mime_type?: WikiMimeType;
    type_lock?: boolean;
    allow_cid?: string[];
    allow_gid?: string[];
    deny_cid?: string[];
    deny_gid?: string[];
    scope?: "private";
  },
): Promise<{ success: boolean; resource_id: string; url_name: string }> {
  const res = await apiFetch(wikiUrl(nick), {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`createWiki failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function savePage(
  nick: string,
  wikiUrlName: string,
  pageUrlName: string,
  payload: { content: string; commit_msg?: string; mime_type?: string },
): Promise<{ success: boolean }> {
  const res = await apiFetch(wikiUrl(nick, wikiUrlName, pageUrlName), {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`savePage failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function deletePage(
  nick: string,
  wikiUrlName: string,
  pageUrlName: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch(wikiUrl(nick, wikiUrlName, pageUrlName), {
    method: "DELETE",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`deletePage failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function fetchPageRevision(
  nick: string,
  wikiUrlName: string,
  pageUrlName: string,
  revision: number,
): Promise<WikiPageResponse> {
  const url = wikiUrl(nick, wikiUrlName, pageUrlName) + `?revision=${revision}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`fetchPageRevision ${res.status}`);
  const json = await res.json();
  return json.data as WikiPageResponse;
}

export async function fetchPageHistory(
  nick: string,
  wikiUrlName: string,
  pageUrlName: string,
): Promise<PageHistoryResponse> {
  const res = await apiFetch(wikiUrl(nick, wikiUrlName, pageUrlName, "history"));
  if (!res.ok) throw new Error(`fetchPageHistory failed: ${res.status}`);
  const json = await res.json();
  return json.data as PageHistoryResponse;
}

export async function revertPage(
  nick: string,
  wikiUrlName: string,
  pageUrlName: string,
  revision: number,
): Promise<{ success: boolean }> {
  const res = await apiFetch(wikiUrl(nick, wikiUrlName, pageUrlName, "revert"), {
    method: "POST",
    body: JSON.stringify({ revision }),
  });
  if (!res.ok) throw new Error(`revertPage failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function renamePage(
  nick: string,
  wikiUrlName: string,
  pageUrlName: string,
  newName: string,
): Promise<{ success: boolean; url_name: string }> {
  const res = await apiFetch(wikiUrl(nick, wikiUrlName, pageUrlName, "rename"), {
    method: "POST",
    body: JSON.stringify({ new_name: newName }),
  });
  if (!res.ok) throw new Error(`renamePage failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function deleteWiki(
  nick: string,
  wikiUrlName: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch(wikiUrl(nick, wikiUrlName), {
    method: "DELETE",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`deleteWiki failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export interface WikiAclData {
  allow_cid: string[];
  allow_gid: string[];
  deny_cid: string[];
  deny_gid: string[];
}

export async function fetchWikiAcl(nick: string, wikiUrlName: string): Promise<WikiAclData> {
  const res = await apiFetch(wikiUrl(nick, wikiUrlName, "acl"));
  if (!res.ok) throw new Error(`fetchWikiAcl failed: ${res.status}`);
  const json = await res.json();
  return json.data as WikiAclData;
}

export async function saveWikiAcl(
  nick: string,
  wikiUrlName: string,
  acl: WikiAclData & { scope?: "private" },
): Promise<void> {
  const res = await apiFetch(wikiUrl(nick, wikiUrlName, "acl"), {
    method: "POST",
    body: JSON.stringify(acl),
  });
  if (!res.ok) throw new Error(`saveWikiAcl failed: ${res.status}`);
}
