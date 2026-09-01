/**
 * acl-mode.ts
 * Pure ACL helpers shared by every <AclPicker> host — no JSX, so they are
 * unit-testable under `node --experimental-strip-types` (see acl-mode.test.ts).
 * Re-exported from AclPicker.tsx; import from either.
 */
import type { AclEntry } from "@/modules/network/api";

export type AclMode = "public" | "connections" | "me" | "custom";
export type { AclEntry };

// Key format: "{type}:{xid}" — e.g. "c:abc123..." or "g:d7ac40c2-..."
export function entryKey(e: AclEntry): string {
  return `${e.type}:${e.xid}`;
}

// "me" is the picker's user-facing wording; every backend ACL resolver
// speaks of it as scope/visibility "private" (allow_cid = the owner's own
// channel hash, resolved server-side since the client doesn't know it).
export function aclModeToScope(mode: AclMode): "public" | "connections" | "private" | "custom" {
  return mode === "me" ? "private" : mode;
}

/** The stored ACL columns, as every read endpoint hands them back. */
export interface StoredAcl {
  allow_cid?: string[];
  allow_gid?: string[];
  deny_cid?: string[];
  deny_gid?: string[];
  public_policy?: string;
}

/**
 * Inverse of aclModeToScope: recover the picker mode from stored ACL columns.
 *
 * "Only me" is not a stored state — the server expands scope "private" into
 * allow_cid = [the owner's own hash] (Files.php, Item.php, Webpages.php, …), so
 * without `selfHash` it is indistinguishable from a one-contact custom ACL and
 * reads back as "Custom" with a chip that can never resolve to a name (/acl
 * filters abook_self = 0, so you are never in your own connections list).
 *
 * `selfHash` comes from useNavViewer().hash; pass undefined and the "me" case
 * simply falls through to "custom", i.e. the old behaviour.
 */
/** Order-independent equality for two stored ACLs. */
function sameAcl(a: StoredAcl, b: StoredAcl): boolean {
  const key = (x: StoredAcl) =>
    (["allow_cid", "allow_gid", "deny_cid", "deny_gid"] as const)
      .map((f) => [...(x[f] ?? [])].sort().join(","))
      .join("|");
  return key(a) === key(b);
}

/** True when this ACL restricts anything at all. */
export function aclIsRestricted(acl: StoredAcl): boolean {
  return !!(
    acl.allow_cid?.length || acl.allow_gid?.length ||
    acl.deny_cid?.length  || acl.deny_gid?.length
  );
}

export function aclModeFrom(
  acl: StoredAcl,
  selfHash: string | undefined,
  /**
   * The channel's default ACL, where the stored row has no public_policy column
   * to carry the scope (attach/photo). "Connections" is written as exactly this
   * ACL, so an exact match is the only way to read it back as "connections"
   * rather than "custom" with the default privacy group named as a chip.
   */
  defaultAcl?: StoredAcl,
): AclMode {
  const allowC = acl.allow_cid ?? [];
  const allowG = acl.allow_gid ?? [];
  const denyC = acl.deny_cid ?? [];
  const denyG = acl.deny_gid ?? [];

  if (acl.public_policy === "contacts") return "connections";
  if (
    selfHash &&
    allowC.length === 1 && allowC[0] === selfHash &&
    !allowG.length && !denyC.length && !denyG.length
  ) {
    return "me";
  }
  // Matched against a NON-EMPTY default only: a channel with no default ACL
  // would otherwise make every public file read as "connections".
  if (defaultAcl && aclIsRestricted(defaultAcl) && sameAcl(acl, defaultAcl)) {
    return "connections";
  }
  // A deny-only ACL is still a restriction, so it must read as "custom" —
  // treating it as "public" would drop the deny list on the next save.
  if (allowC.length || allowG.length || denyC.length || denyG.length) return "custom";
  return "public";
}

/** The allow/deny picker keys for a stored ACL — empty unless the mode is "custom". */
export function aclEntryKeys(acl: StoredAcl, mode: AclMode): {
  allow: Set<string>;
  deny: Set<string>;
} {
  if (mode !== "custom") return { allow: new Set(), deny: new Set() };
  return {
    allow: new Set([
      ...(acl.allow_cid ?? []).map((h) => `c:${h}`),
      ...(acl.allow_gid ?? []).map((g) => `g:${g}`),
    ]),
    deny: new Set([
      ...(acl.deny_cid ?? []).map((h) => `c:${h}`),
      ...(acl.deny_gid ?? []).map((g) => `g:${g}`),
    ]),
  };
}
