// modules/directory/tokens/api.ts
import { apiFetch } from "@utsukta/spa-core/lib/fetch";

export interface GuestToken {
  id: number;
  name: string;
  token: string;
  /** guest:<name>@<host> — what the guest types at the ordinary login form. */
  guest_addr: string;
  xchan_hash: string;
  /** UTC datetime, or null when the token never expires. */
  expires: string | null;
  expired: boolean;
  role: string;
}

export interface GuestRole {
  name: string;
  label: string;
  system: boolean;
}

export interface TokensMeta {
  roles: GuestRole[];
  quota: { used: number; limit: number | null };
}

export interface TokenPayload {
  name: string;
  token: string;
  expires?: string;
  role?: string;
}

async function json(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || "Request failed");
  return body;
}

export async function fetchTokens(): Promise<{ tokens: GuestToken[]; meta: TokensMeta }> {
  const { data, meta } = await json(await apiFetch("/spa/tokens"));
  return { tokens: data as GuestToken[], meta: meta as TokensMeta };
}

/** A fresh password to prefill the form with, matching classic's new_token(). */
export async function newTokenValue(): Promise<string> {
  const { data } = await json(await apiFetch("/spa/tokens/new"));
  return data.token as string;
}

export async function saveToken(id: number | null, payload: TokenPayload): Promise<GuestToken> {
  const { data } = await json(
    await apiFetch(id ? `/spa/tokens/${id}` : "/spa/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return data as GuestToken;
}

export async function deleteToken(id: number): Promise<void> {
  await json(
    await apiFetch(`/spa/tokens/${id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
}
