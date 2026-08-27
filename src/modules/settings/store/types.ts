// ── Display ──────────────────────────────────────────────────────────────────
export interface DisplaySettings {
  theme: string;
  themes: string[];
  color_scheme: string;
  custom_theme_colors?: string;
  update_interval: number;   // seconds (PHP divides ms by 1000)
  itemspage: number;
  start_menu: number;        // 0 | 1
  font_size: "small" | "medium" | "large" | "xl";
  font_family: "system" | "serif" | "monospace" | "nunito" | "saira" | "share-tech" | "playfair" | "libre-baskerville" | "comfortaa" | "space-mono" | "iosevka" | "righteous" | "playwrite-england" | "comic" | "opendyslexic";
  bg_url: string;
  bg_fit: "tile" | "cover";
  scroll_style: "endless" | "load_more";
  post_height: number;
  corner_radius: "none" | "sm" | "default" | "lg" | "xl";
  comment_order: "oldest_first" | "newest_first";
  thread_mode: "threaded" | "flat";
  show_emoji_images: number; // 0 | 1
}

// ── Privacy ──────────────────────────────────────────────────────────────────
export interface PrivacySettings {
  autoperms: number;
  index_opt_out: number;
  permit_all_mentions: number;
  moderate_unsolicited_comments: number;
  ocap_enabled: number;
}

// ── Channel ──────────────────────────────────────────────────────────────────
export interface ChannelSettings {
  permissions_role: string;                          // '' = none set, force selection
  role_options: Record<string, string>;              // role key → translated label
  timezone: string;
  timezones: Record<string, Record<string, string>>; // continent → { zoneId: city }
  defloc: string;
  allow_location: number; // 0 | 1
  adult: number;          // 0 | 1
  maxreq: number;
  photo_path: string;
  attach_path: string;
  expire: number;
  expire_sys: number;     // site-wide expire limit, 0 = none (hint only)
  message_filter_incl: string;
  message_filter_excl: string;
  // Custom-role permission limits: [key, label, value, help, options]
  permiss_arr: [string, string, number, string, Record<number, string>][];
  group_actor: number;    // 0 | 1
}

// ── Account ──────────────────────────────────────────────────────────────────
export type QuotaKey =
  | "total_identities" | "total_channels" | "total_feeds" | "total_items" | "total_pages"
  | "photo_upload_limit" | "attach_upload_limit" | "chatrooms" | "chatters_inroom"
  | "access_tokens" | "minimum_feedcheck_minutes";

export interface AccountQuota {
  key: QuotaKey;
  limit: number;
  // null for keys that aren't a running total (a floor value or a per-room
  // concurrent count) — those only ever show the configured limit.
  usage: number | null;
}

export interface AccountSettings {
  $email: string;
  quotas: AccountQuota[];
}

// ── Locations ────────────────────────────────────────────────────────────────
export interface LocationEntry {
  id: number;
  addr: string;
  url: string;
  primary: boolean;
  isLocal: boolean;
}

// ── Notifications ─────────────────────────────────────────────────────────────
export interface NotificationSettings {
  evdays: number;
  always_show_in_notices: number;
  update_notices_per_parent: number;
  notify1: number; notify2: number; notify3: number; notify4: number;
  notify5: number; notify6: number; notify7: number; notify8: number;
  notify9: number;
  vnotify1: number; vnotify2: number; vnotify3: number; vnotify4: number;
  vnotify5: number; vnotify6: number; vnotify7: number; vnotify8: number;
  vnotify9: number; vnotify10: number; vnotify11?: number; vnotify12: number;
  vnotify13?: number; vnotify14: number; vnotify15: number;
  post_newfriend: number;
  post_joingroup: number;
  post_profilechange: number;
  mailhost: string;
}
