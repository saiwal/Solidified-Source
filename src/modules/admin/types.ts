// ── Summary ───────────────────────────────────────────────────────────────────

export interface AdminSummary {
  accounts: {
    total: number;
    blocked: number;
    expired: number;
    expiring: number;
  };
  pending: number;
  channels: number;
  queue: number;
  plugins: string[];
  version: string;
}

// ── Site ──────────────────────────────────────────────────────────────────────

export interface AdminSite {
  // Basic identity
  sitename: string;
  banner: string;
  sitelogo_512: string;
  sitelogo_192: string;
  sitelogo_favicon: string;
  admininfo: string;
  siteinfo: string;
  site_location: string;

  // Registration
  register_policy: number;
  access_policy: number;
  max_daily_registrations: number;
  register_text: string;
  minimum_age: number;
  verify_email: boolean;
  register_wo_email: boolean;
  register_sameip: number;
  auto_channel_create: boolean;
  invitation_only: boolean;
  invitation_also: boolean;
  abandon_days: number;

  // Content & visibility
  login_on_homepage: boolean;
  disable_discover_tab: boolean;
  site_firehose: boolean;
  open_pubstream: boolean;
  publish_all: boolean;
  no_community_page: boolean;
  frontpage: string;
  site_sellpage: string;
  first_page: string;
  mirror_frontpage: boolean;
  allowed_sites: string;
  pubstream_incl: string;
  pubstream_excl: string;

  // Defaults
  language: string;
  theme: string;
  default_permissions_role: string;

  // Email
  directory_server: string;
  from_email: string;
  from_email_name: string;
  reply_address: string;

  // Upload limits
  maximagesize: number;

  // Behavior
  enable_context_help: boolean;
  sse_enabled: boolean;
  feed_contacts: boolean;

  // Advanced / technical
  verifyssl: boolean;
  proxyuser: string;
  proxy: string;
  curl_timeout: number;
  delivery_interval: number;
  delivery_batch_count: number;
  poll_interval: number;
  imagick_path: string;
  maxloadavg: number;
  default_expire_days: number;
  active_expire_days: number;
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export interface AdminAccount {
  account_id: number;
  account_email: string;
  account_created: string;
  account_lastlog: string;
  account_expires: string;
  account_service_class: string;
  blocked: boolean | number;
  channels: string;
}

export interface AdminPendingAccount {
  reg_id: number;
  reg_hash: string;
  reg_email: string;
  reg_created: string;
  reg_expires: string;
  reg_atip: string;
  msg: string;
  unverified: boolean;
  expired: boolean;
}

// ── Service classes ───────────────────────────────────────────────────────────

export interface ServiceClassProperties {
  photo_upload_limit?: number;
  attach_upload_limit?: number;
  total_items?: number;
  total_pages?: number;
  total_identities?: number;
  total_channels?: number;
  total_feeds?: number;
  minimum_feedcheck_minutes?: number;
  chatrooms?: number;
  chatters_inroom?: number;
  access_tokens?: number;
  price?: number; // monthly cost, e.g. 9.99; site currency, no per-class currency
}

export interface AdminServiceClass {
  name: string;
  properties: ServiceClassProperties;
  account_count: number;
  is_default: boolean;
}

export interface AdminServiceClasses {
  classes: AdminServiceClass[];
  default_service_class: string;
  unrestricted_count: number;
}

// Fixed, client-owned form metadata — not fetched from the server (labels
// need i18n, which is frontend-only); order matches the core doc's property list.
export interface ServiceClassPropDef {
  key: keyof ServiceClassProperties;
  labelKey: string; // i18n key under `admin`
  unit: "bytes" | "count" | "minutes" | "price";
}

export const SERVICE_CLASS_PROP_DEFS: ServiceClassPropDef[] = [
  { key: "photo_upload_limit", labelKey: "prop_photo_upload_limit", unit: "bytes" },
  { key: "attach_upload_limit", labelKey: "prop_attach_upload_limit", unit: "bytes" },
  { key: "total_items", labelKey: "prop_total_items", unit: "count" },
  { key: "total_pages", labelKey: "prop_total_pages", unit: "count" },
  { key: "total_identities", labelKey: "prop_total_identities", unit: "count" },
  { key: "total_channels", labelKey: "prop_total_channels", unit: "count" },
  { key: "total_feeds", labelKey: "prop_total_feeds", unit: "count" },
  { key: "minimum_feedcheck_minutes", labelKey: "prop_minimum_feedcheck_minutes", unit: "minutes" },
  { key: "chatrooms", labelKey: "prop_chatrooms", unit: "count" },
  { key: "chatters_inroom", labelKey: "prop_chatters_inroom", unit: "count" },
  { key: "access_tokens", labelKey: "prop_access_tokens", unit: "count" },
  { key: "price", labelKey: "prop_price", unit: "price" },
];

// ── Channels ──────────────────────────────────────────────────────────────────

export interface AdminChannel {
  channel_id: number;
  channel_name: string;
  channel_address: string;
  channel_created: string;
  channel_lastpost: string;
  channel_account_id: number;
  blocked: boolean;
  allowcode: boolean;
}

// ── Security ──────────────────────────────────────────────────────────────────

export interface AdminSecurity {
  block_public: boolean;
  cloud_disable_siteroot: boolean;
  cloud_report_disksize: boolean;
  allowed_email: string;
  not_allowed_email: string;
  whitelisted_sites: string;
  blacklisted_sites: string;
  whitelisted_channels: string;
  blacklisted_channels: string;
  embed_allow: string;
  embed_deny: string;
  embed_sslonly: boolean;
  transport_security_header: boolean;
  content_security_policy: boolean;
  trusted_directory_servers: string;
}

// ── Features ──────────────────────────────────────────────────────────────────

export interface FeatureItem {
  id: string;
  label: string;
  desc: string;
  enabled: boolean;
  locked: boolean;
}

export interface FeatureSection {
  key: string;
  label: string;
  items: FeatureItem[];
}

export interface AdminFeatures {
  sections: FeatureSection[];
}

// ── Addons ────────────────────────────────────────────────────────────────────

export interface AdminAddon {
  slug: string;
  name: string;
  description: string;
  version: string;
  author: string;
  installed: boolean;
  active: boolean;
  /** Addon defines <slug>_plugin_admin() — it has a settings form. */
  has_settings: boolean;
}

/** An addon's or theme's own admin form, as Smarty-rendered HTML. */
export interface SettingsForm {
  /** Addon slug or theme name. */
  slug: string;
  html: string;
}

// ── Themes ────────────────────────────────────────────────────────────────────

export interface AdminTheme {
  name: string;
  description: string;
  version: string;
  compatible: boolean;
  mobile: boolean;
  experimental: boolean;
  current: boolean;
  allowed: boolean;
  /** Theme declares theme_admin() in its php/config.php. */
  has_settings: boolean;
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export interface QueueItem {
  outq_hash: string;
  outq_created: string;
  outq_updated: string;
  outq_posturl: string;
  outq_delivered: number;
  outq_priority: number;
  outq_channel: number;
}

export interface AdminQueue {
  items: QueueItem[];
  total: number;
}

// ── Queueworker ───────────────────────────────────────────────────────────────

export interface WorkerJob {
  id: number;
  priority: number;
  cmd: string;
  reservation_id: string | null;
  timeout: string;
}

export interface QueueworkerSettings {
  max_queueworkers: number;
  queueworker_max_age: number;
  queue_worker_sleep: number;
  auto_queue_worker_sleep: number;
}

export interface AdminQueueworker {
  total: number;
  active_workers: number;
  by_command: { cmd: string; total: number }[];
  jobs: WorkerJob[];
  settings: QueueworkerSettings;
}

// ── Profile fields ────────────────────────────────────────────────────────────

export interface ProfdefField {
  id: number;
  field_name: string;
  field_type: string;
  field_desc: string;
  field_help: string;
}

export interface AdminProfileFields {
  basic: string;
  advanced: string;
  all_available: string[];
  custom_fields: ProfdefField[];
}

// ── DB updates ────────────────────────────────────────────────────────────────

export interface DbUpdate {
  dbstructure_id: number;
  [key: string]: unknown;
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export type LogLevel =
  | "LOG_EMERG" | "LOG_ALERT" | "LOG_CRIT" | "LOG_ERR"
  | "LOG_WARNING" | "LOG_NOTICE" | "LOG_INFO" | "LOG_DEBUG"
  | "LOG_UNDEFINED";

export interface LogEntry {
  ts: string | null;
  level: LogLevel;
  logid: string | null;
  file: string | null;
  line: number | null;
  fn: string | null;
  message: string;
}

export interface AdminLogs {
  logfile: string | null;
  debugging: boolean;
  loglevel: number;
  entries: LogEntry[];
}
