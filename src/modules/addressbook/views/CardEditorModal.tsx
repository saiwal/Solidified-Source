import { createSignal, For, Index } from "solid-js";
import { MdOutlineAdd, MdOutlineClose } from "solid-icons/md";
import ComposerModal from "@/shared/editor/components/ComposerModal";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import {
  createCard,
  updateCard,
  type Card,
  type CardInput,
  type TypedAddress,
  type TypedValue,
} from "../api";
import { Button, IconButton } from "@ui/Button";
import { Field, Input, Select, Textarea } from "@ui/Field";

/** vCard ADR components, in spec order. */
const ADR_KEYS = [
  "adr_po_box",
  "adr_extended",
  "adr_street",
  "adr_locality",
  "adr_region",
  "adr_postcode",
  "adr_country",
] as const;

// No width utility here on purpose — every caller composes its own (w-full,
// flex-1, w-32…). Baking w-full in caused TypeSelect's `${fieldClass} w-32`
// to carry two conflicting width utilities, and Tailwind's generated CSS
// order (not class order) decided which won — sometimes squishing the value
// input down to a sliver.
const fieldClass =
  "rounded-lg border border-rim bg-surface px-3 py-1.5 text-sm text-txt " +
  "placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent";

interface Row { type: string; label: string; value: string }
interface AdrRow { type: string; label: string; parts: string[] }

const toRows = (items: TypedValue[]): Row[] =>
  items.map((i) => ({ type: i.type, label: i.label, value: i.value }));

const toAdrRows = (items: TypedAddress[]): AdrRow[] =>
  items.map((i) => ({
    type: i.type,
    label: i.label,
    parts: Array.from({ length: 7 }, (_, n) => i.parts[n] ?? ""),
  }));

interface Props {
  bookId: number;
  /** Absent when creating. */
  card?: Card;
  onClose: () => void;
  onSaved: () => void;
}

export default function CardEditorModal(props: Props) {
  const { t } = useI18n();

  // Seeded once at mount: a background refetch of the card list must never
  // clobber what's being typed here.
  const card = props.card;

  const [fn, setFn] = createSignal(card?.fn ?? "");
  const [org, setOrg] = createSignal(card?.org ?? "");
  const [title, setTitle] = createSignal(card?.title ?? "");
  const [note, setNote] = createSignal(card?.note ?? "");

  const [tels, setTels] = createSignal<Row[]>(toRows(card?.tels ?? []));
  const [emails, setEmails] = createSignal<Row[]>(toRows(card?.emails ?? []));
  const [impps, setImpps] = createSignal<Row[]>(toRows(card?.impps ?? []));
  const [urls, setUrls] = createSignal<Row[]>(toRows(card?.urls ?? []));
  const [adrs, setAdrs] = createSignal<AdrRow[]>(toAdrRows(card?.adrs ?? []));

  const [busy, setBusy] = createSignal(false);

  /** Drop blank rows while keeping the value/type arrays aligned by index. */
  const pairs = (rows: Row[]) => {
    const kept = rows.filter((r) => r.value.trim() !== "");
    return { values: kept.map((r) => r.value.trim()), types: kept.map((r) => r.type) };
  };

  const save = async (e: Event) => {
    e.preventDefault();
    const name = fn().trim();
    if (!name) {
      toast.error(t("addressbook.name_required") as string);
      return;
    }

    const tel = pairs(tels());
    const email = pairs(emails());
    const impp = pairs(impps());
    const url = pairs(urls());
    // An all-blank ADR is still a non-empty PHP array, so it would be written
    // as an empty property — filter it here rather than upstream.
    const keptAdrs = adrs().filter((a) => a.parts.some((p) => p.trim() !== ""));

    const input: CardInput = {
      fn: name,
      org: org().trim(),
      title: title().trim(),
      note: note().trim(),
      tel: tel.values,
      tel_type: tel.types,
      email: email.values,
      email_type: email.types,
      impp: impp.values,
      impp_type: impp.types,
      url: url.values,
      url_type: url.types,
      adr: keptAdrs.map((a) => a.parts.map((p) => p.trim())),
      adr_type: keptAdrs.map((a) => a.type),
    };

    setBusy(true);
    try {
      if (card) {
        await updateCard(props.bookId, card.uri, input);
      } else {
        await createCard(props.bookId, input);
      }
      props.onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (t("addressbook.save_failed") as string));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ComposerModal
      title={t(card ? "addressbook.edit_contact" : "addressbook.new_contact") as string}
      widthClass="max-w-3xl"
      onClose={props.onClose}
      footer={
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            {t("addressbook.cancel")}
          </Button>
          <Button size="sm" type="submit" form="card-editor" disabled={busy() || !fn().trim()}>
            {busy() ? t("addressbook.saving") : t("addressbook.save")}
          </Button>
        </div>
      }
    >
      <form id="card-editor" onSubmit={save} class="space-y-6 px-5 py-4">
        <Field size="sm" label={t("addressbook.name") as string}>
          <Input
            class="w-full"
            value={fn()}
            onInput={(e) => setFn(e.currentTarget.value)}
            autofocus
            required
          />
        </Field>

        <div class="grid gap-4 sm:grid-cols-2">
          <Field size="sm" label={t("addressbook.organization") as string}>
            <Input class="w-full" value={org()} onInput={(e) => setOrg(e.currentTarget.value)} />
          </Field>
          <Field size="sm" label={t("addressbook.job_title") as string}>
            <Input class="w-full" value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
          </Field>
        </div>

        <div class="space-y-5 rounded-lg border border-rim/60 bg-elevated/30 p-4">
          <RowGroup label={t("addressbook.phone") as string} addLabel={t("addressbook.add_phone") as string}
                    rows={tels()} setRows={setTels} withCell type="tel" />
          <RowGroup label={t("addressbook.email") as string} addLabel={t("addressbook.add_email") as string}
                    rows={emails()} setRows={setEmails} type="email" />
          <RowGroup label={t("addressbook.impp") as string} addLabel={t("addressbook.add_impp") as string}
                    rows={impps()} setRows={setImpps} />
          <RowGroup label={t("addressbook.website") as string} addLabel={t("addressbook.add_website") as string}
                    rows={urls()} setRows={setUrls} type="url" />
        </div>

        <AdrGroup rows={adrs()} setRows={setAdrs} />

        <Field size="sm" label={t("addressbook.note") as string}>
          <Textarea class="w-full min-h-24" value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
        </Field>
      </form>
    </ComposerModal>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────


/**
 * The raw vCard TYPE values core writes. Anything else on an incoming card
 * (set by a DAV client) is kept as an extra option so editing preserves it.
 */
function TypeSelect(props: {
  value: string;
  label: string;
  withCell?: boolean;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();

  const options = () => {
    const base = [
      { value: "", label: t("addressbook.type_unspecified") as string },
      ...(props.withCell ? [{ value: "CELL", label: t("addressbook.type_mobile") as string }] : []),
      { value: "HOME", label: t("addressbook.type_home") as string },
      { value: "WORK", label: t("addressbook.type_work") as string },
      { value: "OTHER", label: t("addressbook.type_other") as string },
    ];
    if (props.value && !base.some((o) => o.value === props.value)) {
      base.push({ value: props.value, label: props.label || props.value });
    }
    return base;
  };

  return (
    <Select class="w-32 shrink-0" value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)}>
      <For each={options()}>
        {(o) => <option value={o.value}>{o.label}</option>}
      </For>
    </Select>
  );
}

function RowGroup(props: {
  label: string;
  addLabel: string;
  rows: Row[];
  setRows: (rows: Row[]) => void;
  withCell?: boolean;
  type?: string;
}) {
  const { t } = useI18n();

  const patch = (i: number, next: Partial<Row>) =>
    props.setRows(props.rows.map((r, n) => (n === i ? { ...r, ...next } : r)));

  return (
    <div class="space-y-2">
      <span class="text-xs font-medium text-muted">{props.label}</span>
      <Index each={props.rows}>
        {(row, i) => (
          <div class="flex items-center gap-2">
            <input class={`${fieldClass} min-w-0 flex-1`} type={props.type ?? "text"} value={row().value}
                   onInput={(e) => patch(i, { value: e.currentTarget.value })} />
            <TypeSelect value={row().type} label={row().label} withCell={props.withCell}
                        onChange={(v) => patch(i, { type: v })} />
            <IconButton
              label={t("addressbook.remove_field") as string}
              variant="danger"
              size="sm"
              class="shrink-0"
              onClick={() => props.setRows(props.rows.filter((_, n) => n !== i))}
            >
              <MdOutlineClose class="w-4 h-4" />
            </IconButton>
          </div>
        )}
      </Index>
      <button type="button"
              onClick={() => props.setRows([...props.rows, { type: "", label: "", value: "" }])}
              class="flex items-center gap-1.5 text-xs text-muted hover:text-txt">
        <MdOutlineAdd class="w-3.5 h-3.5" />
        {props.addLabel}
      </button>
    </div>
  );
}

function AdrGroup(props: { rows: AdrRow[]; setRows: (rows: AdrRow[]) => void }) {
  const { t } = useI18n();

  const patchPart = (i: number, part: number, value: string) =>
    props.setRows(
      props.rows.map((r, n) =>
        n === i ? { ...r, parts: r.parts.map((p, m) => (m === part ? value : p)) } : r,
      ),
    );

  return (
    <div class="space-y-2">
      <span class="text-xs font-medium text-muted">{t("addressbook.address")}</span>
      <Index each={props.rows}>
        {(row, i) => (
          <div class="rounded-lg border border-rim p-3 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <TypeSelect value={row().type} label={row().label}
                          onChange={(v) => props.setRows(
                            props.rows.map((r, n) => (n === i ? { ...r, type: v } : r)),
                          )} />
              <IconButton
                label={t("addressbook.remove_field") as string}
                variant="danger"
                size="sm"
                onClick={() => props.setRows(props.rows.filter((_, n) => n !== i))}
              >
                <MdOutlineClose class="w-4 h-4" />
              </IconButton>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <For each={ADR_KEYS}>
                {(key, part) => (
                  <Input
                    class="w-full"
                    value={row().parts[part()] ?? ""}
                    placeholder={t(`addressbook.${key}`) as string}
                    aria-label={t(`addressbook.${key}`) as string}
                    onInput={(e) => patchPart(i, part(), e.currentTarget.value)}
                  />
                )}
              </For>
            </div>
          </div>
        )}
      </Index>
      <button type="button"
              onClick={() => props.setRows([
                ...props.rows,
                { type: "", label: "", parts: Array(7).fill("") },
              ])}
              class="flex items-center gap-1.5 text-xs text-muted hover:text-txt">
        <MdOutlineAdd class="w-3.5 h-3.5" />
        {t("addressbook.add_address")}
      </button>
    </div>
  );
}
