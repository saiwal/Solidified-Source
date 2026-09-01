import { apiError } from "./fetch";
// shared/lib/nav-api.ts

export interface NavViewer {
  is_local: boolean;
  is_remote: boolean;
  is_admin: boolean;
  /** True when the local user owns the subject channel (or no channel context) */
  is_owner: boolean;
  nick: string;
  /**
   * The observer's own xchan hash. "Only me" is stored as allow_cid = [this],
   * so ACL pickers need it to tell that apart from a one-contact custom ACL.
   * Empty for an anonymous visitor.
   */
  hash: string;
  name: string;
  /** Federated address — @user@domain */
  addr: string;
  avatar: string;
  avatar_s: string;
  avatar_l: string;
  avatar_mime: string;
  forum: boolean;
  url: string;
  uid: number;
  baseurl: string;
  location: string;
  theme: string;
  timezone: string;
  startpage: string;
}

export interface NavChannel {
  id: number;
  nick: string;
  name: string;
}

export interface NavActions {
	admin?: string;
  logout?: string;
  settings?: string;
  manage?: string;
  profile?: string;
  profiles?: string;
  channel?: string;
	navhome?: string;
  login?: string;
  remote_login?: string;
  register?: string;
}

export interface NavApp {
  name: string;
  label: string;
  /** Primary URL — already stripped of the optional settings URL */
  url: string;
  /** Raw comma-separated URL from Hubzilla (primary[, settings]) */
  url_raw: string;
  /** Settings URL if present, e.g. for Network, Photos */
  settings_url: string;
  /**
   * Bootstrap Icon name extracted from the `photo` field.
   * Hubzilla stores icons as "icon:<bi-name>" (e.g. "icon:house").
   * Falls back to "" when the photo field is a real image URL.
   */
  bi_icon: string;
  /** Raw photo value from Hubzilla — real URL or "icon:*" string */
  photo: string;
  requires: string;
}

export interface NavChannelTab {
  id: string;
  label: string;
  url: string;
  icon: string;
}

/** Site config of the openstreetmap addon (see Api/Handlers/Nav.php). */
export interface OsmConfig {
  /** Tile/map server base url — sysadmins may self-host. */
  tmsserver: string;
  zoom: number;
  marker: number;
}

export interface NavApiResponse {
  viewer: NavViewer;
  actions: NavActions;
  /** Site banner / name */
  banner: string;
  /** Admin-uploaded site logo (192x192 PNG URL) — empty when unset */
  sitelogo: string;
  /** Current channel reddress or @hostname — empty for the owner */
  sitelocation: string;
  /** All channels on this account — empty for visitors / delegate sessions */
  channels: NavChannel[];
  /** "Navigation Channel Select" feature toggle — see settings.title_features */
  nav_channel_select: boolean;
  /** User-ordered pinned apps (nav_pinned_app) — primary sidebar nav */
  pinned: NavApp[];
  /** User's featured app selection (nav_featured_app) — empty for non-local users */
  featured: NavApp[];
  /** Full built-in system app list (syslist / get_system_apps) — available to all users */
  system_apps: NavApp[];
  channel_tabs: NavChannelTab[];
  has_public_stream: boolean;
  /** All installed app names for the local user — empty for visitors/anon */
  installed_apps: string[];
  /** openstreetmap addon site config — null when the addon isn't enabled. */
  osm: OsmConfig | null;
  /** Effective classic-Hubzilla language for this request (2-letter code, e.g. "de") */
  language: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the primary URL from a potentially comma-separated Hubzilla app URL.
 * "https://example.com/network, https://example.com/settings/network"
 * → "https://example.com/network"
 */
export function primaryUrl(raw: string): string {
  return raw.split(",")[0].trim();
}

/**
 * Extract the optional settings URL (second segment after comma), or "".
 */
export function settingsUrl(raw: string): string {
  const parts = raw.split(",");
  return parts.length > 1 ? parts[1].trim() : "";
}

/**
 * Parse "icon:<bi-name>" → "<bi-name>", or "" for real image URLs.
 */
export function biIconName(photo: string): string {
  if (photo.startsWith("icon:")) return photo.slice(5);
  return "";
}

const BI_TO_ICON: Record<string, string> = {
  newspaper: "articles",
  "calendar-date": "calendar",
  "calendar-event": "calendar",
  cart: "cart",
  "card-text": "cards",
  "chat-text": "chat",
  "chat-dots": "chat",
  "person-circle": "hq",
  "grid-3x3": "network",
  "layout-text-sidebar": "webpages",
  "pencil-square": "wiki",
  bookmark: "bookmark",
  "person-vcard": "person",
  house: "home",
  people: "connections",
  "person-lock": "settings",
  "diagram-3": "directory",
  folder: "cloud",
  "question-lg": "help",
  "question-circle": "help",
  "person-plus": "register",
  sticky: "notes",
  "columns-gap": "pdl",
  image: "photos",
  "pencil-fill": "edit",
  "file-lock": "groups",
  globe: "pubstream",
  "person-lines-fill": "connections",
  rss: "network",
  search: "grid",
};

export function biToNavIcon(biName: string): string {
  return BI_TO_ICON[biName] ?? "";
}

/**
 * Normalise a raw Hubzilla app object into the clean NavApp shape.
 */
export function normaliseApp(raw: {
  name: string;
  label: string;
  url: string;
  photo: string;
  requires: string;
}): NavApp {
  return {
    name: raw.name,
    label: raw.label || raw.name,
    url: primaryUrl(raw.url),
    url_raw: raw.url,
    settings_url: settingsUrl(raw.url),
    bi_icon: biIconName(raw.photo),
    photo: raw.photo,
    requires: raw.requires ?? "",
  };
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchNavApi(channelNick?: string): Promise<NavApiResponse> {
  const params = new URLSearchParams();
  if (channelNick) params.set("channel_nick", channelNick);

  const url = channelNick ? `/spa/nav?${params}` : "/spa/nav";
  const res = await fetch(url);
  if (!res.ok) throw await apiError(res, "navapi");

  const json = await res.json();
  const raw = json.data ?? json;

  // Normalise app arrays
  const pinned: NavApp[]       = (raw.pinned       ?? []).map(normaliseApp);
  const featured: NavApp[]     = (raw.featured     ?? []).map(normaliseApp);
  const system_apps: NavApp[]  = (raw.system_apps  ?? []).map(normaliseApp);

  return {
    viewer:           raw.viewer,
    actions:          raw.actions ?? {},
    banner:           raw.banner ?? "",
    sitelogo:         raw.sitelogo ?? "",
    sitelocation:     raw.sitelocation ?? "",
    channels:         raw.channels ?? [],
    nav_channel_select: raw.nav_channel_select ?? false,
    pinned,
    featured,
    system_apps,
    channel_tabs:     raw.channel_tabs ?? [],
    has_public_stream: raw.has_public_stream ?? false,
    installed_apps:   raw.installed_apps ?? [],
    osm:              raw.osm ?? null,
    language:         raw.language ?? "",
  };
}
