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
import { MdFillCheck_circle, MdFillError, MdFillExpand_more, MdFillSend } from "solid-icons/md";
import { Section } from "../Section";
import {
  checkRecipients,
  fetchInviteInfo,
  sendInvites,
  type InviteInfo,
  type RecipientResult,
} from "../../invite/api";
import { Button } from "@ui/Button";
import { Field, Input, Textarea } from "@ui/Field";
import { Chip } from "@ui/Chip";
import { Stat } from "@ui/Stat";
import { Banner } from "@ui/Banner";
import { Collapsible } from "@ui/Collapsible";
import { Skeleton } from "@ui/Skeleton";

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
  const [previewOpen, setPreviewOpen] = createSignal(false);

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

  const canSend = () => !!info() && !busy() && addresses().length > 0 && !!style();

  return (
    <Section
      narrow
      title={t("invite.title")}
      description={t("invite.description")}
      actions={info.error ? [] : [{
        label: t("invite.submit"),
        icon: MdFillSend,
        onClick: () => void send(),
        disabled: !canSend(),
        primary: true,
      }]}
    >
      {/* A gate failure (app off, invites disabled, quota spent) is the whole
          answer — core returns the message instead of the form, so do that. */}
      <Show when={!info.error} fallback={
        <Banner tone="warning" role="alert">{String(info.error?.message ?? info.error)}</Banner>
      }>
        <Show when={info()} fallback={<Skeleton class="h-96" />}>
          {(d) => (
            <div class="space-y-8">
              {/* ── Quotas ── */}
              <div class="grid grid-cols-2 gap-3">
                <Stat label={t("invite.quota_mine")} value={<span class="tabular-nums">{quotaLabel(d())}</span>} />
                <Stat label={t("invite.quota_site")} value={<span class="tabular-nums">{d().site.used} / {d().site.max}</span>} />
              </div>

              {/* ── Recipients ── */}
              <section class="space-y-3">
                <h2 class="text-sm font-semibold text-txt">{t("invite.section_recipients")}</h2>
                <Field
                  label={t("invite.recipients_label")}
                  hint={t("invite.max_recipients", { max: String(d().max_recipients) })}
                >
                  <Textarea
                    class="w-full h-28"
                    value={recipients()}
                    onInput={(e) => { setRecipients(e.currentTarget.value); setResults(null); }}
                  />
                </Field>
                <div class="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={check}
                    disabled={busy() || addresses().length === 0}
                  >
                    {t("invite.check")}
                  </Button>
                </div>
                <Show when={results()}>
                  <ul class="space-y-1">
                    <For each={results()!}>
                      {(r) => (
                        <li class={`flex items-start gap-1.5 text-xs ${r.ok ? "text-muted" : "text-danger-txt"}`}>
                          <Show when={r.ok} fallback={<MdFillError size={13} class="mt-0.5 shrink-0" />}>
                            <MdFillCheck_circle size={13} class="mt-0.5 shrink-0 text-success-txt" />
                          </Show>
                          <span>{r.message}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>

              {/* ── Message ── */}
              <section class="space-y-4">
                <h2 class="text-sm font-semibold text-txt">{t("invite.section_message")}</h2>
                {/* Template pickers — the language lane only lists locales that
                    have an invite template AND that the SPA itself ships. */}
                <div class="space-y-2">
                  <p class="text-xs text-muted">{t("invite.template_label")}</p>
                  <Show when={langs().length > 1}>
                    <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("invite.template_label")}>
                      <For each={langs()}>
                        {(l) => <Chip selected={lang() === l} onClick={() => setLang(l)}>{l}</Chip>}
                      </For>
                    </div>
                  </Show>
                  <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("invite.template_label")}>
                    <For each={styles()}>
                      {(st) => <Chip selected={style() === st} onClick={() => setStyle(st)}>{st}</Chip>}
                    </For>
                  </div>
                </div>
                <Field label={t("invite.subject_label")}>
                  <Input
                    class="w-full"
                    type="text"
                    value={subject()}
                    onInput={(e) => setSubject(e.currentTarget.value)}
                  />
                </Field>
                <Field label={t("invite.message_label")}>
                  <Textarea
                    class="w-full h-24"
                    placeholder={t("invite.message_ph")}
                    value={message()}
                    onInput={(e) => setMessage(e.currentTarget.value)}
                  />
                </Field>
                <Collapsible
                  open={previewOpen()}
                  onOpenChange={setPreviewOpen}
                  panelClass="pt-2"
                  header={(trigger) => (
                    <button type="button" {...trigger} class="flex items-center gap-1 text-xs text-muted hover:text-txt">
                      <MdFillExpand_more size={16} class={`transition-transform ${previewOpen() ? "rotate-180" : ""}`} />
                      {t("invite.preview_label")}
                    </button>
                  )}
                >
                  <pre class="bg-elevated/60 rounded-xl p-3 text-xs text-muted font-[inherit]
                              whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                    {template()?.body ?? ""}
                  </pre>
                </Collapsible>
              </section>

              {/* ── Expiry ── */}
              <section class="space-y-3">
                <h2 class="text-sm font-semibold text-txt">{t("invite.expire_label")}</h2>
                <div class="flex flex-wrap items-center gap-2">
                  <Input
                    class="w-16"
                    type="number"
                    min="1"
                    max="99"
                    aria-label={t("invite.expire_label")}
                    value={durn()}
                    onInput={(e) => setDurn(parseInt(e.currentTarget.value, 10) || 1)}
                  />
                  <For each={UNITS}>
                    {(u) => (
                      <Chip selected={durq() === u} onClick={() => setDurq(u)}>
                        {t(`invite.unit_${u}` as "invite.unit_d")}
                      </Chip>
                    )}
                  </For>
                </div>
                <p class="text-xs text-muted">
                  {t("invite.valid_until")} <span class="tabular-nums">{d().expire.due}</span>
                </p>
              </section>

              <p class="text-xs text-muted">{t("invite.log_note")}</p>
            </div>
          )}
        </Show>
      </Show>
    </Section>
  );
};

export default InviteSection;
