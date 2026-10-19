import { apiFetch, apiError } from "./fetch";

// The superblock addon's block list (Handlers/Blocklist.php). Every call 403s
// unless the addon is enabled and the viewer installed its app — gate the UI on
// isAppInstalled(installedApps, SUPERBLOCK_APP).
export const SUPERBLOCK_APP = "/superblock";

export interface BlockedChannel {
  hash: string;
  name: string;
  address: string;
  url: string;
  photo: string;
  /** ISO8601 end of a timed block; null = permanent. May already be past. */
  until: string | null;
}

export type BlockUnit = "minutes" | "hours" | "days" | "weeks" | "months" | "years";
export interface BlockDuration { amount: number; unit: BlockUnit }

export interface BlockSettings {
  block_reshares: boolean;
  block_incoming: boolean;
}

export async function fetchBlockedChannels(): Promise<BlockedChannel[]> {
  const res = await apiFetch("/spa/blocklist");
  if (!res.ok) throw await apiError(res, "blocklist");
  const body = await res.json();
  return body.data as BlockedChannel[];
}

async function postBlocklistAction(
  action: "block" | "unblock" | "siteblock",
  author: string,
  duration?: BlockDuration | null,
): Promise<{ address: string }> {
  const res = await apiFetch("/spa/blocklist", {
    method: "POST",
    body: JSON.stringify({ action, author, ...(duration ? { duration } : {}) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `blocklist ${action} HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.data ?? body;
}

/** No duration = permanent, as in the addon. */
export function blockChannel(author: string, duration?: BlockDuration | null) {
  return postBlocklistAction("block", author, duration);
}

export function unblockChannel(author: string) {
  return postBlocklistAction("unblock", author);
}

export function blockChannelFromSite(author: string) {
  return postBlocklistAction("siteblock", author);
}

export async function fetchBlockSettings(): Promise<BlockSettings> {
  const res = await apiFetch("/spa/blocklist/settings");
  if (!res.ok) throw await apiError(res, "blocklist settings");
  return (await res.json()).data as BlockSettings;
}

export async function saveBlockSettings(s: Partial<BlockSettings>): Promise<BlockSettings> {
  const res = await apiFetch("/spa/blocklist/settings", { method: "POST", body: JSON.stringify(s) });
  if (!res.ok) throw await apiError(res, "blocklist settings");
  return (await res.json()).data as BlockSettings;
}
