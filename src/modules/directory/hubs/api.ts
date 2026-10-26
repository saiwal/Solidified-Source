export type PubSite = {
  url: string;
  urltext: string;
  host: string;
	register_url: string;
  sellpage: string | null;
  access: string;
  register: string;
  project: string;
  version: string;
  location: string;
  rating_enabled: boolean;
  can_rate: boolean;
};

export async function fetchPubsites(): Promise<PubSite[]> {
  const res = await fetch('/spa/pubsites');
  if (!res.ok) throw new Error('Failed to fetch pubsites');
  const json = await res.json();
  const d = json.data ?? json; // unwrap data envelope
  return d.sites ?? [];
}

// Another hub's /siteinfo.json, proxied and sanitised by /spa/pubsites/info
// (core sends no CORS headers, so the browser can't fetch it directly).
export type HubInfo = {
  url: string;
  platform: string;
  site_name: string;
  version: string;
  version_tag: string;
  server_role: string;
  commit: string;
  plugins: string[];
  register_policy: string;   // REGISTER_OPEN | REGISTER_APPROVE | REGISTER_CLOSED
  invitation_only: boolean;
  directory_mode: string;    // DIRECTORY_MODE_*
  directory_server: string;
  language: string;
  rss_connections: boolean;
  expiration: number | null; // days; 0 = never
  default_service_restrictions: Record<string, number>;
  locked_features: string[];
  admin: { name: string; address: string; channel: string }[];
  dbdriver: string;
  lastpoll: string;
  info: string;
  channels_total: number | null;
  hide_in_statistics: boolean;
  channels_active_halfyear: number | null;
  channels_active_monthly: number | null;
  local_posts: number | null;
  local_comments: number | null;
};

export async function fetchHubInfo(host: string): Promise<HubInfo> {
  const res = await fetch(`/spa/pubsites/info?host=${encodeURIComponent(host)}`);
  if (!res.ok) throw new Error(`hub info: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}
