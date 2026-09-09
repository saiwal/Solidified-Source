// modules/directory/people/api.ts

export interface DirectoryEntry {
  hash: string;
  name: string;
  address: string;
  network: string;
  photo: string;
  description: string;
  about: string;
  location: string;
  age: number | null;
  gender: string;
  marital: string;
  homepage: string;
  hometown: string;
  keywords: string[];
  updated: string;
  public_forum: boolean;
  is_connected: boolean;
  connect_url: string;
  profile_url: string;
  cover: string | null;
  common_count: number | null;
  ignore_url: string | null;
  censored: number;
}

export interface DirectoryMeta {
  total: number;
  page: number;
  start: number;
  limit: number;
  globaldir: boolean;
  safe_mode: number;
  suggest: boolean;
  order: string;
  is_directory_admin: boolean;
}

export interface DirectoryResponse {
  meta: DirectoryMeta;
  entries: DirectoryEntry[];
}

export interface DirectoryParams {
  search?: string;
  keywords?: string;
  order?: "date" | "rdate" | "alphabetic" | "ralpha";
  global?: 0 | 1;
  safe?: 0 | 1;
  pubforums?: 0 | 1;
  suggest?: 0 | 1;
  start?: number;
}

export async function fetchDirectory(
  params: DirectoryParams = {},
): Promise<DirectoryResponse> {
  const q = new URLSearchParams();
  if (params.search)               q.set("search",    params.search);
  if (params.keywords)             q.set("keywords",  params.keywords);
  if (params.order)                q.set("order",     params.order);
  if (params.global !== undefined) q.set("global",    String(params.global));
  if (params.safe)                 q.set("safe",      String(params.safe));
  if (params.pubforums)            q.set("pubforums", String(params.pubforums));
  if (params.suggest !== undefined) q.set("suggest",  String(params.suggest));
  if (params.start)                q.set("start",     String(params.start));

  const res = await fetch(`/spa/directory?${q}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Directory fetch failed: ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? body.error);
  return { entries: body.data, meta: body.meta } as DirectoryResponse;
}

// Core Mod_Follow: GET /follow?f=&url=<addr>&interactive=0 with a local
// channel session; interactive=0 makes it answer JSON instead of redirecting.
export async function addConnection(addr: string): Promise<void> {
  const res = await fetch(
    `/follow?f=&url=${encodeURIComponent(addr)}&interactive=0`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`Follow failed: ${res.status}`);
  const body = await res.json().catch(() => null);
  if (!body?.success) {
    throw new Error(body?.message || "Follow failed");
  }
}

// Core Mod_Dircensor: GET /dircensor/<xchan_hash>?severity=0|1|2&aj=1 — site-admin
// only, marks a directory entry OK(0), Unsafe(1), or Spam/Hidden(2). aj=1 makes
// it answer JSON instead of redirecting.
export async function censorEntry(hash: string, severity: 0 | 1 | 2): Promise<void> {
  const res = await fetch(
    `/dircensor/${encodeURIComponent(hash)}?severity=${severity}&aj=1`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`Censor failed: ${res.status}`);
  const body = await res.json().catch(() => null);
  if (!body?.success) {
    throw new Error("Censor failed");
  }
}

// A visitor (no local channel here) gets no connect_url — core's /follow needs a
// local session — so the only action we can offer is the local /chanview page,
// which carries the entry's data in query params.
export function chanviewHref(entry: DirectoryEntry): string {
  const params = new URLSearchParams({ f: "", hash: entry.hash, addr: entry.address, name: entry.name });
  if (entry.photo) params.set("photo", entry.photo);
  if (entry.profile_url) params.set("url", entry.profile_url);
  if (entry.description) params.set("desc", entry.description);
  if (entry.location) params.set("location", entry.location);
  if (entry.homepage) params.set("homepage", entry.homepage);
  if (entry.cover) params.set("cover", entry.cover);
  if (entry.keywords.length) params.set("kw", entry.keywords.join(","));
  if (entry.public_forum) params.set("forum", "1");
  return `/chanview?${params.toString()}`;
}
