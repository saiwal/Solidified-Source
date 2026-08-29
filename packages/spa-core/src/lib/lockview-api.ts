import { apiFetch } from "./fetch";

export { scopeLabel } from "./scope-label";

/** The Lockview resource types core accepts (Zotlabs/Module/Lockview.php). */
export type LockviewType = "item" | "photo" | "attach" | "menu_item" | "chatroom";

export interface LockviewEntry {
  kind: "contact" | "group" | "profile";
  name: string;
  denied: boolean;
}

export interface LockviewGuest {
  id: number;
  name: string;
  /** The resource URL with ?zat=<token> appended — a bearer credential. */
  url: string;
  expires: string | null;
}

export interface Lockview {
  /** Raw public_policy; pass to scopeLabel() to render. */
  scope: string;
  /**
   * True when the item is private but names no audience to enumerate (feed
   * items, private-to-self, bcc) — show the scope label instead of the empty
   * access list.
   */
  no_audience?: boolean;
  access: LockviewEntry[];
  guests: LockviewGuest[];
  /** Channel guests not yet on this resource's ACL — grantable via grantGuest(). */
  other_guests: { id: number; name: string }[];
}

export async function fetchLockview(type: LockviewType, id: number | string): Promise<Lockview | null> {
  const res = await apiFetch(`/spa/lockview/${type}/${id}`);
  if (!res.ok) return null;
  const { data } = await res.json();
  return data as Lockview;
}

/** Adds one of your guests to this resource's audience; returns their link. */
export async function grantGuest(
  type: LockviewType,
  id: number | string,
  atokenId: number,
): Promise<LockviewGuest> {
  const res = await apiFetch(`/spa/lockview/${type}/${id}/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ atoken_id: atokenId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || "Could not add the guest");
  return json.data as LockviewGuest;
}
