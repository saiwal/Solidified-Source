// modules/directory/views/sections/InviteSection.tsx
//
// Rendered by ConnectionsShellView when activeKey === "invite".
//
// Emails invitation codes, mirroring core's Zotlabs/Module/Invite.php: quota
// counters, a recipient list with a dry-run check, an expiry picker, a
// language/style template picker with a live preview, an editable subject and
// a personal note. Field labels are lifted from core so they match the docs.

import { For, Show, createEffect, createMemo, createSignal, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { toast } from "@utsukta/spa-core/store/toast";
import { MdFillCheck_circle, MdFillError, MdFillSend } from "solid-icons/md";
import SubPageContent from "@/shared/views/SubPageContent";
import {
  checkRecipients,
  fetchInviteInfo,
  sendInvites,
  type InviteInfo,
  type RecipientResult,
} from "../../invite/api";

const inputClass =
  "w-full bg-elevated border border-rim rounded-lg px-2 py-1.5 text-sm text-txt";

const chipClass = (active: boolean) =>
  `px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
    active
      ? "border-accent text-accent bg-accent/10"
      : "border-rim text-muted hover:border-rim-strong hover:text-txt"
  }`;

// Core's field_duration.qmc.tpl offers exactly these three, even though
// calcdue() also understands w/m/y.
const UNITS = ["i", "h", "d"] as const;

const InviteSection: Component = () => {
  const { t } = useI18n();
  const [info, { refetch }] = createQueryResource("invite", fetchInviteInfo);

  const [recipients, setRecipients] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [subject, setSubject] = createSignal("");
  const [lang, setLang] = createSignal("");
  const [style, setStyle] = createSignal("");
  const [durn, setDurn] = createSignal(2);
  const [durq, setDurq] = createSignal<string>("d");
  const [results, setResults] = createSignal<RecipientResult[] | null>(null);
  const [busy, setBusy] = createSignal(false);

  // Seed the pickers from the server's defaults once the payload lands.
  createEffect(() => {
    const d = info();
    if (!d || lang()) return;
    setLang(d.default_lang);
    setStyle(d.default_style);
    setDurn(parseInt(d.expire.durn, 10) || 2);
    setDurq(d.expire.durq);
  });

  const langs = () => Object.keys(info()?.templates ?? {});
  const styles = () => Object.keys(info()?.templates?.[lang()] ?? {});
  const template = createMemo(() => info()?.templates?.[lang()]?.[style()]);

  // Core refills the subject from the selected template on every switch, so a
  // half-typed subject doesn't silently ride along into another language.
  createEffect(() => {
    const tpl = template();
    if (tpl) setSubject(tpl.subject);
  });

  const addresses = () =>
    recipients().split("\n").map((s) => s.trim()).filter(Boolean);

  const quotaLabel = (d: InviteInfo) =>
    `${d.quota.mine} / ${d.quota.my_max ?? "∞"}`;

  const expire = () => ({ n: durn(), unit: durq() });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const check = () =>
    run(async () => {
      const res = await checkRecipients(addresses(), expire());
      setResults(res.results);
    });

  const send = () =>
    run(async () => {
      const res = await sendInvites({
        recipients: addresses(),
        message: message(),
        subject: subject(),
        lang: lang(),
        style: style(),
        expire: expire(),
      });
      setResults(res.results);
      const summary = t("invite.sent_summary", { ok: String(res.ok), ko: String(res.ko) });
      res.ko ? toast.warning(summary) : toast.success(summary);
      if (res.ok && !res.ko) {
        setRecipients("");
        setMessage("");
      }
      refetch();
    });

  return (
    <SubPageContent title={t("invite.title")} description={t("invite.description")}>
      {/* A gate failure (app off, invites disabled, quota spent) is the whole
          answer — core returns the message instead of the form, so do that. */}
      <Show when={!info.error} fallback={
        <p class="text-sm text-amber-500">
          {String(info.error?.message ?? info.error)}
        </p>
      }>
        <Show when={info()} fallback={<div class="h-64 bg-surface border border-rim rounded-xl animate-pulse" />}>
          {(d) => (
            <div class="space-y-5">
              {/* Counters */}
              <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                <span>{t("invite.quota_mine")}: {quotaLabel(d())}</span>
                <span>{t("invite.quota_site")}: {d().site.used} / {d().site.max}</span>
              </div>

              {/* Recipients */}
              <div class="space-y-1.5">
                <label class="block text-xs font-medium text-txt">
                  {t("invite.recipients_label")}
                </label>
                <textarea
                  class={`${inputClass} h-28 font-mono`}
                  value={recipients()}
                  onInput={(e) => { setRecipients(e.currentTarget.value); setResults(null); }}
                />
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs text-muted">
                    {t("invite.max_recipients", { max: String(d().max_recipients) })}
                  </p>
                  <button
                    onClick={check}
                    disabled={busy() || addresses().length === 0}
                    class="px-3 py-1.5 rounded-lg text-xs font-medium border border-rim text-muted
                           hover:border-rim-strong hover:text-txt transition-colors disabled:opacity-40"
                  >
                    {t("invite.check")}
                  </button>
                </div>
              </div>

              <Show when={results()}>
                <ul class="space-y-1">
                  <For each={results()!}>
                    {(r) => (
                      <li class={`flex items-start gap-1.5 text-xs ${r.ok ? "text-muted" : "text-red-500"}`}>
                        <Show when={r.ok} fallback={<MdFillError size={13} class="mt-0.5 shrink-0" />}>
                          <MdFillCheck_circle size={13} class="mt-0.5 shrink-0 text-green-500" />
                        </Show>
                        <span>{r.message}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>

              {/* Expiry */}
              <div class="space-y-1.5">
                <label class="block text-xs font-medium text-txt">{t("invite.expire_label")}</label>
                <div class="flex flex-wrap items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="99"
                    class={`${inputClass} w-20`}
                    value={durn()}
                    onInput={(e) => setDurn(parseInt(e.currentTarget.value, 10) || 1)}
                  />
                  <div class="flex items-center gap-1.5">
                    <For each={UNITS}>
                      {(u) => (
                        <button onClick={() => setDurq(u)} class={chipClass(durq() === u)}>
                          {t(`invite.unit_${u}` as "invite.unit_d")}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
                <p class="text-xs text-muted">
                  {t("invite.valid_until")} {d().expire.due}
                </p>
              </div>

              {/* Template pickers — the language lane only lists locales that
                  have an invite template AND that the SPA itself ships. */}
              <div class="space-y-2">
                <label class="block text-xs font-medium text-txt">{t("invite.template_label")}</label>
                <Show when={langs().length > 1}>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <For each={langs()}>
                      {(l) => (
                        <button onClick={() => setLang(l)} class={chipClass(lang() === l)}>
                          {l}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <div class="flex flex-wrap items-center gap-1.5">
                  <For each={styles()}>
                    {(s) => (
                      <button onClick={() => setStyle(s)} class={chipClass(style() === s)}>
                        {s}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              {/* Subject */}
              <div class="space-y-1.5">
                <label class="block text-xs font-medium text-txt">{t("invite.subject_label")}</label>
                <input
                  type="text"
                  class={inputClass}
                  value={subject()}
                  onInput={(e) => setSubject(e.currentTarget.value)}
                />
              </div>

              {/* Preview */}
              <div class="space-y-1.5">
                <label class="block text-xs font-medium text-txt">{t("invite.preview_label")}</label>
                <pre class="bg-elevated border border-rim rounded-lg p-3 text-xs text-muted
                            whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                  {template()?.body ?? ""}
                </pre>
              </div>

              {/* Personal note */}
              <div class="space-y-1.5">
                <label class="block text-xs font-medium text-txt">{t("invite.message_label")}</label>
                <textarea
                  class={`${inputClass} h-24`}
                  placeholder={t("invite.message_ph")}
                  value={message()}
                  onInput={(e) => setMessage(e.currentTarget.value)}
                />
              </div>

              <p class="text-xs text-muted">{t("invite.log_note")}</p>

              <div class="flex justify-end">
                <button
                  onClick={send}
                  disabled={busy() || addresses().length === 0 || !style()}
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-fg
                         text-sm font-medium hover:brightness-110 transition-all disabled:opacity-40"
                >
                  <MdFillSend size={15} />
                  {t("invite.submit")}
                </button>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </SubPageContent>
  );
};

export default InviteSection;
