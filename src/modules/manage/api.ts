export interface ManagedChannel {
  channel_id: number;
  channel_name: string;
  channel_address: string;
  channel_hash: string;
  is_current: boolean;
  is_default: boolean;
  photo: string;
  url: string;
  intros: number;
  notices: number;
}

export interface ManagedDelegate {
  name: string;
  address: string;
  photo: string;
  url: string;
}

export interface ManageApiResponse {
  channels: ManagedChannel[];
  delegates: ManagedDelegate[];
  current_uid: number;
  total_channels: number;
  limit: number | null;
  create_url: string;
}

export interface SwitchResult {
  channel_id: number;
  redirect_to: string;
}

export interface SetDefaultResult {
  default_channel_id: number;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
// modules/manage/api.ts
import { apiFetch } from '@utsukta/spa-core/lib/fetch';

export async function fetchManageApi(): Promise<ManageApiResponse> {
  const res = await apiFetch('/spa/manage');
  if (!res.ok) throw await res.json();
  const { data } = await res.json();
  return data as ManageApiResponse;
}

export async function switchChannel(channelId: number): Promise<SwitchResult> {
  const res = await apiFetch('/spa/manage', {
    method: 'POST',
    body: JSON.stringify({ switch_to: channelId }),
  });
  if (!res.ok) throw await res.json();
  const { data } = await res.json();
  return data as SwitchResult;
}

export async function setDefaultChannel(channelId: number): Promise<SetDefaultResult> {
  const res = await apiFetch('/spa/manage', {
    method: 'POST',
    body: JSON.stringify({ set_default: channelId }),
  });
  if (!res.ok) throw await res.json();
  const { data } = await res.json();
  return data as SetDefaultResult;
}

// ── Client-side helpers ───────────────────────────────────────────────────────

// Reconstructs the Hubzilla magic auth URL for delegate switching.
// address = delegate's xchan_addr, delegateUrl = delegate's xchan_url
export function buildDelegateSwitchUrl(delegateUrl: string, address: string): string {
  const dest = delegateUrl + '?delegate=' + encodeURIComponent(address);
  return `/magic?f=&bdest=${btoa(dest)}&delegate=${encodeURIComponent(address)}`;
}
