import { createSignal } from "solid-js";
import type { LockviewType } from "../lib/lockview-api";

/** One copyable BBCode snippet offered in the share modal. */
export interface ShareEmbed {
  /** i18n key for the row label — a fixed set, so t() stays type-checked. */
  labelKey: "share.embed_bbcode" | "share.attachment_bbcode" | "share.link_bbcode";
  code: string;
}

/**
 * Everything the share modal needs about the thing being shared. Built by the
 * shareTargetFor*() factories in src/shared/lib/shareLinks.ts so call sites
 * stay one-liners.
 */
export interface ShareTarget {
  /** Absolute, publicly-resolvable URL. */
  url: string;
  title: string;
  /** Short plain-text blurb — used in the email body and native share sheet. */
  summary?: string;
  /** BBCode seed for "share as post". Omitted = that option is hidden. */
  postBody?: string;
  embed?: ShareEmbed[];
  /**
   * Identifies this resource to /spa/lockview, which returns who can see it
   * plus any guest-access (?zat=) links. Only set for the types core's
   * Lockview understands; absent = no guest section, which is the right
   * default for things with no Lockview equivalent (articles, cards, webpages).
   */
  lockview?: { type: LockviewType; id: number | string };
  /**
   * The thing itself is not publicly reachable, so embedding it in a post gives
   * the audience a broken image. Set for photos whose own ACL is restricted, or
   * that sit in an album folder a visitor cannot open — a cover photo is the
   * common case, public in the photo table but gated by its album.
   */
  restricted?: boolean;
}

// Global — lets any entity (post, article, card, photo, file, webpage) open
// the share popup from wherever the user currently is. Watched by
// ShareModalHost, mounted once in Layout.tsx alongside the other always-on
// overlays (ToastContainer, FeedModalHost, ConnectionRequestModalHost).
const [shareTarget, setShareTarget] = createSignal<ShareTarget | null>(null);

export function openShare(target: ShareTarget): void {
  setShareTarget(target);
}

export function useShareModal() {
  return [shareTarget, setShareTarget] as const;
}
