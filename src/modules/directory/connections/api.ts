import { apiFetch, apiError } from "@utsukta/spa-core/lib/fetch";

export type ConnectionStatus =
  | "pending"
  | "blocked"
  | "ignored"
  | "hidden"
  | "archived"
  | "not_here";

export type ConnectionOrder =
  | "name"
  | "name_desc"
  | "connected"
  | "connected_desc"
  | "recent";

export type ConnectionFilter =
  | "active"
  | "pending"
  | "blocked"
  | "ignored"
  | "hidden"
  | "archived"
  | "recent"
  | "all"
  // Connections that carry a message filter — the inbox rules overview.
  | "filtered";

export interface Connection {
  id: number;
  xchan_hash: string;
  name: string;
  address: string;
  url: string;
  photo: string;
  network: string;
  is_forum: boolean;
  connected: string;
  closeness: number;
  role: string;
  status: ConnectionStatus[];
  pending: boolean;
  profile_id: number | null;
  granted_perms: string[];
  // abook_incl / abook_excl. Only populated by the paginated list endpoint.
  incl?: string;
  excl?: string;
}

export interface ConnectionsMeta {
  total: number;
  limit: number;
  offset: number;
  filter: ConnectionFilter;
  order: ConnectionOrder;
}

export interface ConnectionsResponse {
  meta: ConnectionsMeta;
  connections: Connection[];
}

export async function fetchConnections(params: {
  filter?: ConnectionFilter;
  // Handlers/Connections.php adds `AND xchan.xchan_pubforum = 1` for this.
  type?: "forum";
  search?: string;
  order?: ConnectionOrder;
  start?: number;
  limit?: number;
}): Promise<ConnectionsResponse> {
  const q = new URLSearchParams();
  if (params.filter) q.set("filter", params.filter);
  if (params.type)   q.set("type",   params.type);
  if (params.search) q.set("search", params.search);
  if (params.order)  q.set("order",  params.order);
  if (params.start)  q.set("start",  String(params.start));
  if (params.limit)  q.set("limit",  String(params.limit));

  const res = await apiFetch(`/spa/connections?${q}`);
  if (!res.ok) throw await apiError(res, "connections");
  const body = await res.json();
  return { connections: body.data, meta: body.meta };
}

export async function fetchConnectionByAddress(address: string): Promise<Connection | null> {
  const res = await apiFetch(`/spa/connections?address=${encodeURIComponent(address)}`);
  if (!res.ok) return null;
  const body = await res.json();
  return body.data as Connection | null;
}

export async function fetchConnectionById(id: number): Promise<Connection | null> {
  const res = await apiFetch(`/spa/connections?id=${id}`);
  if (!res.ok) return null;
  const body = await res.json();
  return body.data as Connection | null;
}

export async function approveConnection(abookId: number): Promise<void> {
  const res = await apiFetch(`/spa/connections/${abookId}/approve`, {
    method: "POST",
    body: "{}",
  });
  if (!res.ok) throw await apiError(res, "approve");
}

export async function refreshConnection(abookId: number): Promise<void> {
  const res = await apiFetch(`/spa/connections/${abookId}/refresh`, {
    method: "POST",
    body: "{}",
  });
  if (!res.ok) throw await apiError(res, "refresh");
}

export async function deleteConnection(abookId: number): Promise<void> {
  const res = await apiFetch(`/spa/connections/${abookId}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "delete");
}

export interface NewConnection {
  abook_id: number;
  xchan: string;
}

// url accepts a webbie ("bob@example.com"), a channel URL, or a bare local
// nickname. Throws with the backend's friendly message on failure — in
// particular a service-class total_channels quota message.
export async function connectToChannel(url: string): Promise<NewConnection> {
  const res = await apiFetch("/spa/connections/connect", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `connect HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.data as NewConnection;
}

export interface Permcat {
  name: string;
  label: string;
  system: boolean;
  is_default: boolean;
}

export interface PermcatPermEntry {
  key: string;
  label: string;
  value: boolean;
  inherited: boolean;
}

export interface PermcatDetail extends Permcat {
  perms: PermcatPermEntry[];
}

export interface PermEntry {
  key: string;
  label: string;
  their: boolean;
  my: boolean;
}

export interface ConnectionPerms {
  incl: string;
  excl: string;
  perms: PermEntry[];
}

export async function fetchPermcats(): Promise<Permcat[]> {
  const res = await apiFetch("/spa/connections/permcats");
  if (!res.ok) throw await apiError(res, "permcats");
  const body = await res.json();
  return body.data as Permcat[];
}

export async function createPermcat(name: string): Promise<Permcat> {
  const res = await apiFetch("/spa/connections/permcats", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `create permcat HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.data as Permcat;
}

export async function fetchPermcatDetail(name: string): Promise<PermcatDetail> {
  const q = new URLSearchParams({ name });
  const res = await apiFetch(`/spa/connections/permcats?${q}`);
  if (!res.ok) throw await apiError(res, "permcat detail");
  const body = await res.json();
  return body.data as PermcatDetail;
}

export async function updatePermcatPerms(name: string, perms: string[]): Promise<Permcat> {
  const res = await apiFetch("/spa/connections/permcats", {
    method: "POST",
    body: JSON.stringify({ name, perms }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `update permcat HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.data as Permcat;
}

export async function setDefaultPermcat(name: string, isDefault: boolean): Promise<Permcat> {
  const res = await apiFetch("/spa/connections/permcats", {
    method: "POST",
    body: JSON.stringify({ name, set_default: isDefault }),
  });
  if (!res.ok) throw await apiError(res, "set default permcat");
  const body = await res.json();
  return body.data as Permcat;
}

export async function assignPermcatToGroup(name: string, gid: number): Promise<{ assigned: number }> {
  const res = await apiFetch("/spa/connections/permcats/assign-group", {
    method: "POST",
    body: JSON.stringify({ name, gid }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `assign to group HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.data as { assigned: number };
}

export async function deletePermcat(name: string): Promise<void> {
  const q = new URLSearchParams({ name });
  const res = await apiFetch(`/spa/connections/permcats?${q}`, {
    method: "DELETE",
  });
  if (!res.ok) throw await apiError(res, "delete permcat");
}

export async function fetchConnectionPerms(abookId: number): Promise<ConnectionPerms> {
  const res = await apiFetch(`/spa/connections/${abookId}/perms`);
  if (!res.ok) throw await apiError(res, "perms");
  const body = await res.json();
  return body.data as ConnectionPerms;
}

export async function fetchConnectionGroups(abookId: number): Promise<number[]> {
  const res = await apiFetch(`/spa/connections/${abookId}/groups`);
  if (!res.ok) throw await apiError(res, "groups");
  const body = await res.json();
  return body.data as number[];
}

export async function updateConnection(
  abookId: number,
  fields: {
    role?: string;
    closeness?: number;
    blocked?: boolean;
    ignored?: boolean;
    archived?: boolean;
    hidden?: boolean;
    incl?: string;
    excl?: string;
    profile_id?: number | null;
  },
): Promise<void> {
  const res = await apiFetch(`/spa/connections/${abookId}`, {
    method: "POST",
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw await apiError(res, "update");
}
