// Invite — email an invitation code to prospective members.
// Backend: packages/spa-core/php/Api/Handlers/Invite.php

import { apiFetch } from "@utsukta/spa-core/lib/fetch";

/** One rendered email template, in one language. */
export interface InviteTemplate {
  subject: string;
  /** Plain text, macros already expanded with a placeholder invite code. */
  body: string;
}

export interface InviteInfo {
  /** my_max is null for site admins — core shows them "∞". */
  quota: { mine: number; my_max: number | null };
  site: { used: number; max: number };
  /** Defaults from system/register_expire, e.g. { durn: "2", durq: "d" }. */
  expire: { durn: string; durq: string; due: string };
  max_recipients: number;
  whoami: string;
  whereami: string;
  default_lang: string;
  default_style: string;
  /** lang → style → template. */
  templates: Record<string, Record<string, InviteTemplate>>;
}

export interface RecipientResult {
  email: string;
  ok: boolean;
  message: string;
}

export interface CheckResult {
  due: string;
  results: RecipientResult[];
}

export interface SendResult {
  ok: number;
  ko: number;
  results: RecipientResult[];
  quota: InviteInfo["quota"];
  site: InviteInfo["site"];
}

export interface InviteInput {
  recipients: string[];
  message: string;
  subject: string;
  lang: string;
  style: string;
  expire: { n: number; unit: string };
}

async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? fallback);
  }
  return (await res.json()).data as T;
}

export async function fetchInviteInfo(): Promise<InviteInfo> {
  const res = await apiFetch("/spa/invite");
  return unwrap<InviteInfo>(res, "Failed to load invitations");
}

/** Dry run — validates the recipient list without sending or storing anything. */
export async function checkRecipients(
  recipients: string[],
  expire: InviteInput["expire"],
): Promise<CheckResult> {
  const res = await apiFetch("/spa/invite/check", {
    method: "POST",
    body: JSON.stringify({ recipients, expire }),
  });
  return unwrap<CheckResult>(res, "Failed to check recipients");
}

export async function sendInvites(input: InviteInput): Promise<SendResult> {
  const res = await apiFetch("/spa/invite", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return unwrap<SendResult>(res, "Failed to send invitations");
}
