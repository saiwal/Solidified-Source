import { createSignal, createUniqueId, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import Modal from "@/shared/views/Modal";
import {
  fetchAdminServiceClasses,
  createServiceClass,
  updateServiceClass,
  deleteServiceClass,
  setDefaultServiceClass,
} from "../../api";
import { SERVICE_CLASS_PROP_DEFS, type AdminServiceClass, type ServiceClassProperties } from "../../types";
import { useI18n } from "@utsukta/spa-core/i18n";

const EMPTY_PROPS: ServiceClassProperties = {};

export default function ServiceClassesSection() {
  const { t } = useI18n();
  const [data, { refetch }] = createQueryResource("admin-service-classes", fetchAdminServiceClasses);

  return (
    <SubPageContent
      title={t("admin.service_classes_title")}
      description={t("admin.service_classes_desc")}
      action={<CreateClassButton onCreated={refetch} />}
      wide
    >
      <Show when={data()} fallback={<Skeleton />}>
        {(d) => (
          <div class="rounded-lg border border-rim overflow-hidden">
            <div class="flex items-center justify-between px-3 py-2.5 border-b border-rim bg-elevated/30">
              <span class="text-sm text-muted">{t("admin.unrestricted_row_label")}</span>
              <span class="px-1.5 py-0.5 text-xs rounded-full bg-elevated text-muted font-medium">
                {d().unrestricted_count}
              </span>
            </div>

            <Show when={d().classes.length > 0} fallback={
              <p class="text-sm text-muted px-3 py-4">{t("admin.no_service_classes")}</p>
            }>
              <For each={d().classes}>
                {(cls) => <ServiceClassRow cls={cls} onChanged={refetch} />}
              </For>
            </Show>
          </div>
        )}
      </Show>
    </SubPageContent>
  );
}

function humanBytes(n?: number): string {
  if (!n) return "";
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

// Byte-valued properties are stored (and enforced by core) as raw bytes, but
// typing e.g. "5242880" is impractical — let the admin pick a unit instead.
const BYTE_UNITS = { GB: 1073741824, MB: 1048576, KB: 1024, B: 1 } as const;
type ByteUnit = keyof typeof BYTE_UNITS;

function bytesToUnitValue(bytes?: number): { magnitude: string; unit: ByteUnit } {
  if (!bytes) return { magnitude: "", unit: "MB" };
  for (const unit of ["GB", "MB", "KB"] as const) {
    if (bytes % BYTE_UNITS[unit] === 0) return { magnitude: String(bytes / BYTE_UNITS[unit]), unit };
  }
  return { magnitude: String(bytes), unit: "B" };
}

function unitValueToBytes(magnitude: string, unit: ByteUnit): number | undefined {
  if (magnitude === "") return undefined;
  const n = Number(magnitude);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * BYTE_UNITS[unit]);
}

function summarizeProps(props: ServiceClassProperties, t: (k: any) => string): string {
  const parts: string[] = [];
  for (const def of SERVICE_CLASS_PROP_DEFS) {
    const v = props[def.key];
    if (!v) continue;
    const label = t(`admin.${def.labelKey}` as any);
    const value = def.unit === "bytes" ? humanBytes(v) : def.unit === "price" ? v.toFixed(2) : String(v);
    parts.push(`${label}: ${value}`);
    if (parts.length >= 3) break;
  }
  return parts.length ? parts.join(" · ") : t("admin.unlimited_hint" as any);
}

function ServiceClassRow(props: { cls: AdminServiceClass; onChanged: () => void }) {
  const { t } = useI18n();
  const [editing, setEditing] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  async function onSetDefault() {
    setBusy(true);
    setError("");
    try {
      await setDefaultServiceClass(props.cls.name);
      props.onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm(t("admin.delete_class_confirm"))) return;
    setBusy(true);
    setError("");
    try {
      await deleteServiceClass(props.cls.name);
      props.onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div class="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-rim last:border-0 hover:bg-elevated/50 transition-colors">
        <div class="min-w-0 space-y-0.5">
          <div class="flex items-center gap-2">
            <span class="text-sm font-mono font-medium text-txt truncate">{props.cls.name}</span>
            <Show when={props.cls.is_default}>
              <span class="px-1.5 py-0.5 text-xs rounded-full bg-accent/15 text-accent font-medium">
                {t("admin.default_badge")}
              </span>
            </Show>
            <span class="px-1.5 py-0.5 text-xs rounded-full bg-elevated text-muted font-medium">
              {props.cls.account_count}
            </span>
          </div>
          <p class="text-xs text-muted truncate">{summarizeProps(props.cls.properties, t)}</p>
          <Show when={error()}>
            <p class="text-xs text-red-600 dark:text-red-400">{error()}</p>
          </Show>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <Show when={!props.cls.is_default}>
            <button
              onClick={onSetDefault}
              disabled={busy()}
              class="px-2 py-1 text-xs rounded border border-rim text-txt hover:bg-elevated
                     disabled:opacity-50 transition-colors"
            >
              {t("admin.set_default")}
            </button>
          </Show>
          <button
            onClick={() => setEditing(true)}
            class="px-2 py-1 text-xs rounded border border-rim text-txt hover:bg-elevated transition-colors"
          >
            {t("admin.edit")}
          </button>
          <button
            onClick={onDelete}
            disabled={busy()}
            class="px-2 py-1 text-xs rounded border border-red-300 text-red-600
                   hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20
                   disabled:opacity-50 transition-colors"
          >
            {t("admin.delete")}
          </button>
        </div>
      </div>

      <Show when={editing()}>
        <ServiceClassModal
          mode="edit"
          initialName={props.cls.name}
          initialProps={props.cls.properties}
          onClose={() => setEditing(false)}
          onSave={async (name, properties) => {
            await updateServiceClass(name, properties);
            setEditing(false);
            props.onChanged();
          }}
        />
      </Show>
    </>
  );
}

function CreateClassButton(props: { onCreated: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = createSignal(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        class="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-accent text-accent-fg
               hover:opacity-90 transition-opacity"
      >
        + {t("admin.create_class")}
      </button>
      <Show when={open()}>
        <ServiceClassModal
          mode="create"
          initialName=""
          initialProps={EMPTY_PROPS}
          onClose={() => setOpen(false)}
          onSave={async (name, properties) => {
            await createServiceClass(name, properties);
            setOpen(false);
            props.onCreated();
          }}
        />
      </Show>
    </>
  );
}

function ServiceClassModal(props: {
  mode: "create" | "edit";
  initialName: string;
  initialProps: ServiceClassProperties;
  onClose: () => void;
  onSave: (name: string, properties: ServiceClassProperties) => Promise<void>;
}) {
  const titleId = createUniqueId();
  const { t } = useI18n();
  const [name, setName] = createSignal(props.initialName);
  const [values, setValues] = createSignal<Record<string, string>>(
    Object.fromEntries(
      SERVICE_CLASS_PROP_DEFS.map((def) => [
        def.key,
        def.unit === "bytes"
          ? bytesToUnitValue(props.initialProps[def.key]).magnitude
          : props.initialProps[def.key]?.toString() ?? "",
      ]),
    ),
  );
  const [units, setUnits] = createSignal<Record<string, ByteUnit>>(
    Object.fromEntries(
      SERVICE_CLASS_PROP_DEFS.filter((def) => def.unit === "bytes")
        .map((def) => [def.key, bytesToUnitValue(props.initialProps[def.key]).unit]),
    ),
  );
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function setUnit(key: string, u: ByteUnit) {
    setUnits((prev) => ({ ...prev, [key]: u }));
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!name().trim()) { setError(t("admin.class_name_label")); return; }

    const properties: ServiceClassProperties = {};
    for (const def of SERVICE_CLASS_PROP_DEFS) {
      const v = values()[def.key];
      if (v === "" || v === undefined) continue;
      const n = def.unit === "bytes" ? unitValueToBytes(v, units()[def.key]) : Number(v);
      if (n !== undefined) (properties as Record<string, number>)[def.key] = n;
    }

    setSaving(true);
    setError("");
    try {
      await props.onSave(name().trim(), properties);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
    }
  }

  return (
    <Modal onClose={props.onClose} labelledBy={titleId} class="z-50">
      <div class="w-full max-w-lg rounded-xl border border-rim bg-base shadow-xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-4 py-3 border-b border-rim sticky top-0 bg-base">
          <h3 id={titleId} class="text-sm font-semibold text-txt">
            {props.mode === "create" ? t("admin.new_class_title") : t("admin.edit_class_title")}
          </h3>
          <button onClick={props.onClose} aria-label={t("layout.close")}
                    class="text-muted hover:text-txt text-lg leading-none">×</button>
        </div>

        <form onSubmit={onSubmit} class="p-4 space-y-4">
          <div class="space-y-1">
            <label class="text-sm font-medium text-txt">{t("admin.class_name_label")}</label>
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              disabled={props.mode === "edit"}
              class={`${inputCls} disabled:opacity-60`}
              placeholder="e.g. standard"
            />
            <p class="text-xs text-muted">{t("admin.class_name_hint")}</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <For each={SERVICE_CLASS_PROP_DEFS}>
              {(def) => (
                <div class="space-y-1">
                  <label class="text-xs font-medium text-txt">
                    {t(`admin.${def.labelKey}` as any)}
                  </label>
                  <Show
                    when={def.unit === "bytes"}
                    fallback={
                      <input
                        type="number"
                        min="0"
                        step={def.unit === "price" ? "0.01" : "1"}
                        value={values()[def.key] ?? ""}
                        onInput={(e) => setValue(def.key, e.currentTarget.value)}
                        class={inputCls}
                        placeholder={def.unit === "price" ? "0.00" : t("admin.unlimited_hint")}
                      />
                    }
                  >
                    <div class="flex gap-1.5">
                      <input
                        type="number"
                        min="0"
                        value={values()[def.key] ?? ""}
                        onInput={(e) => setValue(def.key, e.currentTarget.value)}
                        class={`${inputCls} flex-1`}
                        placeholder={t("admin.unlimited_hint")}
                      />
                      <select
                        value={units()[def.key] ?? "MB"}
                        onChange={(e) => setUnit(def.key, e.currentTarget.value as ByteUnit)}
                        class="px-2 py-1.5 text-sm rounded-lg border border-rim bg-surface text-txt
                               focus:outline-none focus:border-accent"
                      >
                        <option value="KB">KB</option>
                        <option value="MB">MB</option>
                        <option value="GB">GB</option>
                      </select>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <Show when={error()}>
            <p class="text-xs text-red-600 dark:text-red-400">{error()}</p>
          </Show>

          <div class="flex justify-end gap-2 pt-1">
            <button type="button" onClick={props.onClose}
              class="px-3 py-1.5 text-xs rounded-lg border border-rim text-muted hover:bg-elevated transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving()}
              class="px-4 py-1.5 text-xs rounded-lg bg-accent text-accent-fg
                     hover:opacity-90 disabled:opacity-50 transition-opacity">
              {saving() ? t("admin.saving") : t("admin.save")}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

const inputCls =
  "w-full px-3 py-1.5 text-sm rounded-lg border border-rim bg-surface text-txt " +
  "placeholder:text-muted focus:outline-none focus:border-accent";

function Skeleton() {
  return (
    <div class="rounded-lg border border-rim overflow-hidden animate-pulse">
      {Array.from({ length: 4 }, () => (
        <div class="h-14 border-b border-rim bg-elevated/30 last:border-0" />
      ))}
    </div>
  );
}
