import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";
import type {
  AdminSummary, AdminSite, AdminAccount, AdminPendingAccount,
  AdminChannel, AdminSecurity, AdminFeatures, AdminAddon, AdminTheme,
  AdminQueue, AdminQueueworker, QueueworkerSettings,
  AdminProfileFields, ProfdefField, DbUpdate, AdminLogs,
  ThemeOptions, AdminServiceClass, AdminServiceClasses, ServiceClassProperties,
  AddonSettingsForm,
} from "./types";

const BASE = "/spa/admin";

async function get<T>(section: string, params?: Record<string, string>): Promise<T> {
  const url = params
    ? `${BASE}/${section}?${new URLSearchParams(params)}`
    : `${BASE}/${section}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
  const { data } = await res.json();
  return data as T;
}

async function post<T = { status: string }>(section: string, body: unknown): Promise<T> {
  const res = await apiFetch(`${BASE}/${section}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error?.message ?? "Request failed");
  }
  const { data } = await res.json();
  return data as T;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export const fetchAdminSummary = () => get<AdminSummary>("summary");

// ── Site ──────────────────────────────────────────────────────────────────────

export const fetchAdminSite = () => get<AdminSite>("site");

export const saveAdminSite = async (data: Partial<AdminSite>): Promise<void> => { await post("site", data); };

export interface SiteLogoUploadResult {
  sitelogo_512: string;
  sitelogo_192: string;
  sitelogo_favicon: string;
}

export function uploadSiteLogo(file: Blob, onProgress?: (pct: number) => void): Promise<SiteLogoUploadResult> {
  return new Promise(async (resolve, reject) => {
    const token = await getCsrfToken().catch(() => "");
    const fd = new FormData();
    fd.append("file", file, "sitelogo.png");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/spa/site-logo");
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRF-Token", token);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve((json.data ?? {}) as SiteLogoUploadResult);
        } catch {
          reject(new Error("Invalid upload response"));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(fd);
  });
}

export async function removeSiteLogo(): Promise<void> {
  const token = await getCsrfToken().catch(() => "");
  const fd = new FormData();
  fd.append("remove", "1");
  const res = await fetch("/spa/site-logo", {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": token },
    body: fd,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error?.message ?? "Remove failed");
  }
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export interface AccountsPage {
  data: AdminAccount[];
  meta: { offset: number; limit: number; count: number; root_count: number; has_more: boolean };
  pending: AdminPendingAccount[];
}

export async function fetchAdminAccounts(page = 0): Promise<AccountsPage> {
  const res = await apiFetch(`${BASE}/accounts?page=${page}`);
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
  const { data } = await res.json();
  return { pending: [], ...data };
}

export const adminAccountAction = (account_id: number, action: "block" | "unblock" | "delete") =>
  post("accounts", { account_id, action });

export const adminPendingAction = (reg_id: number, action: "approve" | "deny") =>
  post("accounts", { reg_id, action });

export const setAccountServiceClass = (account_id: number, service_class: string) =>
  post("accounts", { account_id, action: "set_service_class", service_class });

export const setAccountExpires = (account_id: number, expires: string) =>
  post("accounts", { account_id, action: "set_expires", expires }); // "" clears it

export const setAccountPassword = (account_id: number, new_password: string) =>
  post("accounts", { account_id, action: "set_password", new_password });

// ── Service classes ──────────────────────────────────────────────────────────

export const fetchAdminServiceClasses = () => get<AdminServiceClasses>("service-classes");

export const createServiceClass = (name: string, properties: ServiceClassProperties) =>
  post<AdminServiceClass>("service-classes", { action: "create", name, properties });

export const updateServiceClass = (name: string, properties: ServiceClassProperties) =>
  post("service-classes", { action: "update", name, properties });

export const deleteServiceClass = (name: string) =>
  post("service-classes", { action: "delete", name });

export const setDefaultServiceClass = (name: string) =>
  post<{ status: string; default_service_class: string }>("service-classes", { action: "set_default", name });

// ── Channels ──────────────────────────────────────────────────────────────────

export interface ChannelsPage {
  data: AdminChannel[];
  meta: { offset: number; limit: number; count: number; root_count: number; has_more: boolean };
}

export async function fetchAdminChannels(page = 0): Promise<ChannelsPage> {
  const res = await apiFetch(`${BASE}/channels?page=${page}`);
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
  return res.json() as Promise<ChannelsPage>;
}

export const adminChannelAction = (
  channel_id: number,
  action: "block" | "unblock" | "allowcode" | "disallowcode" | "delete",
) => post("channels", { channel_id, action });

// ── Security ──────────────────────────────────────────────────────────────────

export const fetchAdminSecurity = () => get<AdminSecurity>("security");

export const saveAdminSecurity = async (data: Partial<AdminSecurity>): Promise<void> => { await post("security", data); };

// ── Features ──────────────────────────────────────────────────────────────────

export const fetchAdminFeatures = () => get<AdminFeatures>("features");

export const saveAdminFeatures = (data: Record<string, boolean>) => post("features", data);

// ── Addons ────────────────────────────────────────────────────────────────────

export async function fetchAdminAddons(): Promise<AdminAddon[]> {
  const r = await get<{ addons: AdminAddon[] }>("addons");
  return r.addons;
}

export async function toggleAddon(slug: string): Promise<{ name: string; active: boolean }> {
  return post("addons", { action: "toggle", name: slug });
}

export const fetchAddonSettings = (slug: string) =>
  get<AddonSettingsForm>(`addons/${encodeURIComponent(slug)}`);

/** Field names/values scraped off the rendered form, posted back for the
 *  addon's own <slug>_plugin_admin_post() to read out of $_POST. */
export const saveAddonSettings = (slug: string, fields: Record<string, string | string[]>) =>
  post<AddonSettingsForm>("addons", { action: "settings", name: slug, fields });

// ── Themes ────────────────────────────────────────────────────────────────────

export async function fetchAdminThemes(): Promise<{ themes: AdminTheme[]; current: string }> {
  return get("themes");
}

export async function fetchThemeOptions(theme: string): Promise<ThemeOptions> {
  return get("themes/options", { theme });
}

export async function saveThemeOptions(theme: string, formData: Record<string, string>): Promise<void> {
  await post("themes", { action: "options", theme, form_data: formData });
}

export async function toggleTheme(theme: string): Promise<void> {
  await post("themes", { action: "toggle", theme });
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export const fetchAdminQueue = () => get<AdminQueue>("inspect-queue");

// ── Queueworker ───────────────────────────────────────────────────────────────

export const fetchAdminQueueworker = () => get<AdminQueueworker>("queueworker");

export const saveQueueworkerSettings = (s: QueueworkerSettings) =>
  post("queueworker", s);

// ── Profile fields ────────────────────────────────────────────────────────────

export const fetchAdminProfileFields = () => get<AdminProfileFields>("profile-fields");

export const saveProfileFieldLayout = (basic: string, advanced: string) =>
  post("profile-fields", { action: "save_layout", basic, advanced });

export const createProfileField = (f: Omit<ProfdefField, "id">) =>
  post<{ field: ProfdefField }>("profile-fields", { action: "create", ...f });

export const updateProfileField = (id: number, f: Omit<ProfdefField, "id">) =>
  post("profile-fields", { action: "update", id, ...f });

export const deleteProfileField = (id: number) =>
  post("profile-fields", { action: "delete", id });

// ── DB updates ────────────────────────────────────────────────────────────────

export async function fetchAdminDbUpdates(): Promise<DbUpdate[]> {
  const r = await get<{ updates: DbUpdate[] }>("db-updates");
  return r.updates;
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export const fetchAdminLogs = () => get<AdminLogs>("logs");

export const saveLogSettings = (settings: { debugging: boolean; logfile: string; loglevel: number }) =>
  post<AdminLogs>("logs", settings);
