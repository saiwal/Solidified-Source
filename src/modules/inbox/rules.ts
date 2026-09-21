// Auto-filing rules: the client half. The expression is compiled here by
// filter-dsl.ts and stored as a string, so the server never parses the DSL —
// it just hands it to core's MessageFilter (Concerns/FilesByRules.php).
import { apiFetch, apiError } from "@utsukta/spa-core/lib/fetch";
import { setInboxRules, type InboxRule } from "@utsukta/spa-core/store/auth-store";

async function post(body: Record<string, unknown>) {
  const res = await apiFetch("/spa/settings/inbox_rules", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res, "inbox rules");
  return (await res.json()).data;
}

/** Saves the whole list — the server validates and returns what it kept. */
export async function saveInboxRules(rules: InboxRule[]): Promise<InboxRule[]> {
  const kept = (await post({ rules })).rules as InboxRule[];
  setInboxRules(kept ?? []);
  return kept ?? [];
}

/** Rewinds the cursor so the rules re-run over existing mail on the next load. */
export const rerunInboxRules = () => post({ reset: true });

export const newRule = (): InboxRule => ({
  id: Math.random().toString(36).slice(2, 10),
  name: "",
  folder: "",
  expr: "",
  enabled: true,
});
