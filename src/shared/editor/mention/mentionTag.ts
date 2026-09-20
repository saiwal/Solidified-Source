/**
 * The two pure pieces of @-mention handling: what counts as the query at the
 * caret, and what text a picked suggestion inserts.
 *
 * Own file so they are testable — useMention.ts pulls in solid-js and the
 * query client (same reasoning as lib/addon-url.ts).
 */

import type { MentionEntry } from "./useMention";

/**
 * The text between the mention's "@" and the caret, or null when the caret
 * isn't in a mention.
 *
 * Anchored to start-of-text-or-whitespace, mirroring core's autocomplete
 * match (`/(^|\s)(@)([^ \n]{3,})$/`, view/js/autocomplete.js). Anchoring
 * matters for a full webbie: with a plain lastIndexOf("@"), typing
 * "@alice@hub.tld" made the query "hub.tld", so accepting a suggestion
 * replaced only that and left "@alice@alice@hub.tld" behind. It also stops a
 * bare email address in the body from opening the popup.
 */
export function mentionQueryAt(before: string): string | null {
  return /(?:^|\s)@([^\s]*)$/.exec(before)?.[1] ?? null;
}

/**
 * The text core's own autocomplete inserts: `@{alice@hub.tld}`. The braces
 * are load-bearing — handle_tag() (include/text.php:2936) only matches the
 * whole xchan table, on xchan_addr *or* xchan_url, for the braced spelling.
 * A bare "@alice@hub.tld" falls through to the abook-only fallbacks, so a
 * channel you aren't connected to silently stayed unlinked: no [zrl], no
 * TERM_MENTION row, no mention notification.
 */
export function mentionTag(entry: MentionEntry): string {
  return `@{${entry.addr}}`;
}
