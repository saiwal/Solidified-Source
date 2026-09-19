// Mirrors core's zidify_links() (include/zid.php:170), called from
// prepare_text() — i.e. at the display boundary, which is renderBody() here.
//
// [zmg]/[zrl] render with class="zrl"; core appends the observer's zid to
// those and only those. The author's hub then sees ?zid=<webbie>, runs
// zid_init() (include/channel.php:1971) and bounces the request through
// /magic for reverse magic auth, so a photo whose ACL names you is served.
// Without it a DM's private images stay unauthorised until you log in to the
// author's hub by hand.

// Seeded synchronously from the `var zid` the page template inlines (see
// src/php/default.php, mirroring core's head.tpl). It has to be synchronous:
// renderBody() runs inside the activity mapper at fetch time, not in a
// reactive scope, so a stream response that beat /spa/pconfig would render
// every image without a zid and never re-render. Plain module state for the
// same reason — a signal would have no one tracking it.
//
// Deliberately not cached in localStorage: the cache would outlive a logout
// and hand the previous channel's identity to remote hubs on the next boot.
let myAddress = ((): string => {
  const raw = (globalThis as { zid?: unknown }).zid;
  if (typeof raw !== "string" || !raw) return "";
  // head.tpl escapes it as a url component; the template here does not, but
  // decoding an already-plain webbie is a no-op either way.
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
})();

/** Refreshed from /spa/pconfig's `my_address` (core's get_my_address()). */
export function setMyAddress(addr: string): void {
  myAddress = addr;
}

function currentHost(): string {
  return globalThis.location?.host ?? "";
}

/** core's zid(): add the observer's address to a cross-hub url. */
export function zid(url: string, address = myAddress, host = currentHost()): string {
  if (!url || !address || url.includes("zid=")) return url;
  try {
    const u = new URL(url.replace(/&amp;/g, "&"), globalThis.location?.href);
    if (u.host === host || (u.protocol !== "http:" && u.protocol !== "https:")) return url;
    u.searchParams.set("zid", address);
    return u.toString().replace(/&/g, "&amp;");
  } catch {
    return url;
  }
}

export function zidifyLinks(html: string, address = myAddress, host = currentHost()): string {
  if (!address) return html;
  return html.replace(
    /<(a|img)\s([^>]*?)(href|src)="([^"]*)"/gi,
    (m, tag: string, attrs: string, attr: string, url: string) =>
      /class="[^"]*\bzrl\b/i.test(attrs)
        ? `<${tag} ${attrs}${attr}="${zid(url, address, host)}"`
        : m,
  );
}
