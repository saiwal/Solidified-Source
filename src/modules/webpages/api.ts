import { apiFetch } from '@utsukta/spa-core/lib/fetch';

export type WebPage = {
  iid: number;
  mid: string;
  title: string;
  pagelink: string;
  mimetype: string;
  created: string;
  edited: string;
  is_private: boolean;
  view_url: string;
  edit_url: string;
};

export type WebPageDetail = {
  iid: number;
  uuid: string;
  mid: string;
  title: string;
  summary: string;
  body: string;
  mimetype: string;
  slug: string;
  created: string;
  edited: string;
  item_private: number;
  public_policy: string;
  allow_cid: string[];
  allow_gid: string[];
  deny_cid: string[];
  deny_gid: string[];
  /** Assigned layout-template id, or null when this page uses the module default. */
  layout_template: string | null;
};

export async function fetchWebpages(nick: string): Promise<WebPage[]> {
  const res = await apiFetch(`/spa/webpages/${nick}`);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? 'Failed to fetch webpages');
  }
  const json = await res.json();
  return (json.data ?? []) as WebPage[];
}

/** Fetch a single page by its pagelink slug (used by PageView via /page/:nick/*path) */
export async function fetchWebPageByPagelink(
  nick: string,
  pagelink: string,
): Promise<WebPageDetail> {
  const res = await apiFetch(
    `/spa/webpages/${nick}?pagelink=${encodeURIComponent(pagelink)}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? 'Failed to fetch page');
  }
  const json = await res.json();
  return json.data as WebPageDetail;
}

/** Fetch a single page by its mid (used by inline editor / detail view) */
export async function fetchWebPageByMid(
  nick: string,
  mid: string,
): Promise<WebPageDetail> {
  const res = await apiFetch(
    `/spa/webpages/${nick}?mid=${encodeURIComponent(mid)}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? 'Failed to fetch page');
  }
  const json = await res.json();
  return json.data as WebPageDetail;
}

export async function deleteWebPage(iid: number, nick: string): Promise<void> {
  const res = await apiFetch('/spa/webpages', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', nick, iid }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? 'Delete failed');
  }
}

/** Fetch a single page by its item id (used by the SPA editor view) */
export async function fetchWebPageByIid(
  nick: string,
  iid: number,
): Promise<WebPageDetail> {
  const res = await apiFetch(
    `/spa/webpages/${nick}?iid=${iid}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? 'Failed to fetch page');
  }
  const json = await res.json();
  return json.data as WebPageDetail;
}

// ── Blocks — item-backed content presets (Hubzilla's core "blocks" feature) ──

export type Block = {
  iid: number;
  mid: string;
  title: string;
  name: string;
  mimetype: string;
  created: string;
  edited: string;
  is_private: boolean;
};

export type BlockDetail = {
  uuid: string;
  mid: string;
  title: string;
  body: string;
  mimetype: string;
  name: string;
  created: string;
  edited: string;
  item_private: number;
  public_policy: string;
  allow_cid: string[];
  allow_gid: string[];
  deny_cid: string[];
  deny_gid: string[];
};

export async function fetchBlocks(nick: string): Promise<Block[]> {
  const res = await apiFetch(`/spa/blocks/${nick}`);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? 'Failed to fetch blocks');
  }
  const json = await res.json();
  return (json.data ?? []) as Block[];
}

/** Fetch a single block by its item id (used by the SPA editor view) */
export async function fetchBlockByIid(
  nick: string,
  iid: number,
): Promise<BlockDetail> {
  const res = await apiFetch(`/spa/blocks/${nick}?iid=${iid}`);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? 'Failed to fetch block');
  }
  const json = await res.json();
  return json.data as BlockDetail;
}

/** Fetch a single block by its saved name (used by the HTML Block widget preset) */
export async function fetchBlockByName(
  nick: string,
  name: string,
): Promise<BlockDetail> {
  const res = await apiFetch(`/spa/blocks/${nick}?name=${encodeURIComponent(name)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? 'Failed to fetch block');
  }
  const json = await res.json();
  return json.data as BlockDetail;
}

export async function deleteBlock(iid: number, nick: string): Promise<void> {
  const res = await apiFetch('/spa/blocks', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', nick, iid }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? 'Delete failed');
  }
}
