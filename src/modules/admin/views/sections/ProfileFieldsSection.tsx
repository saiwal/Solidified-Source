import { createSignal, For, Show, batch } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import {
  fetchAdminProfileFields,
  saveProfileFieldLayout,
  createProfileField,
  updateProfileField,
  deleteProfileField,
} from "../../api";
import type { ProfdefField } from "../../types";

// "tags" is ours, not core's: stored as a plain comma-separated string like
// every other profext value, rendered as chips on the profile.
const FIELD_TYPES = ["text", "textarea", "checkbox", "select", "tags"] as const;

const EMPTY: Omit<ProfdefField, "id"> = {
  field_name: "",
  field_type: "text",
  field_desc: "",
  field_help: "",
  field_inputs: "",
};

export default function ProfileFieldsSection() {
  const [data, { refetch }] = createQueryResource("admin-profile-fields", fetchAdminProfileFields);
  const [basic, setBasic] = createSignal("");
  const [advanced, setAdvanced] = createSignal("");
  const [layoutSaving, setLayoutSaving] = createSignal(false);
  const [layoutSaved, setLayoutSaved] = createSignal(false);

  // Seed textareas when data loads
  let seeded = false;
  const seededData = () => {
    const d = data();
    if (d && !seeded) {
      seeded = true;
      setBasic(d.basic);
      setAdvanced(d.advanced);
    }
    return d;
  };

  async function onSaveLayout() {
    setLayoutSaving(true);
    try {
      await saveProfileFieldLayout(basic(), advanced());
      batch(() => { setLayoutSaving(false); setLayoutSaved(true); });
      setTimeout(() => setLayoutSaved(false), 2000);
      refetch();
    } catch { setLayoutSaving(false); }
  }

  return (
    <SubPageContent
      title="Profile Fields"
      description="Configure which fields appear on user profiles and manage custom fields."
      action={<CreateButton onCreated={refetch} />}
    >
      <Show when={seededData()} fallback={<Skeleton />}>
        {(d) => (
          <div class="space-y-6">
            {/* All available fields */}
            <div class="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-1">
              <p class="text-xs font-semibold text-accent">All available fields</p>
              <p class="text-xs text-txt leading-relaxed">
                {d().all_available.join(", ")}
              </p>
            </div>

            {/* Layout form */}
            <div class="rounded-lg border border-rim bg-surface p-4 space-y-4">
              <div class="space-y-1">
                <label class="text-sm font-medium text-txt">Basic Profile Fields</label>
                <textarea
                  value={basic()}
                  onInput={(e) => setBasic(e.currentTarget.value)}
                  rows={3}
                  class="w-full px-3 py-2 text-sm rounded-lg border border-rim bg-surface text-txt
                         placeholder:text-muted focus:outline-none focus:border-accent resize-y font-mono"
                />
              </div>

              <div class="space-y-1">
                <label class="text-sm font-medium text-txt">Advanced Profile Fields</label>
                <textarea
                  value={advanced()}
                  onInput={(e) => setAdvanced(e.currentTarget.value)}
                  rows={3}
                  class="w-full px-3 py-2 text-sm rounded-lg border border-rim bg-surface text-txt
                         placeholder:text-muted focus:outline-none focus:border-accent resize-y font-mono"
                />
                <p class="text-xs text-muted">(In addition to basic fields)</p>
              </div>

              <div class="flex items-center gap-3 justify-end">
                <Show when={layoutSaved()}>
                  <span class="text-xs text-green-600 dark:text-green-400">Saved</span>
                </Show>
                <button
                  onClick={onSaveLayout}
                  disabled={layoutSaving()}
                  class="px-4 py-1.5 text-sm rounded-lg bg-accent text-accent-fg
                         hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {layoutSaving() ? "Saving…" : "Submit"}
                </button>
              </div>
            </div>

            {/* Custom fields */}
            <div class="space-y-2">
              <div class="space-y-0.5">
                <p class="text-sm font-semibold text-txt">Custom Fields</p>
                <p class="text-xs text-muted">
                  A new field only appears on profiles once its name is also added to the
                  Basic or Advanced list above. Advanced fields reach only channels that have
                  the "Advanced profiles" feature enabled — use Basic to reach everyone.
                </p>
              </div>
              <Show
                when={d().custom_fields.length > 0}
                fallback={<p class="text-sm text-muted py-2">No custom fields defined.</p>}
              >
                <div class="rounded-lg border border-rim overflow-hidden">
                  <For each={d().custom_fields}>
                    {(field) => (
                      <CustomFieldRow field={field} onChanged={refetch} />
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </SubPageContent>
  );
}

// ── Create button in header ───────────────────────────────────────────────────

function CreateButton(props: { onCreated: () => void }) {
  const [open, setOpen] = createSignal(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        class="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-accent text-accent-fg
               hover:opacity-90 transition-opacity"
      >
        + Create Custom Field
      </button>
      <Show when={open()}>
        <FieldModal
          title="New Profile Field"
          initial={EMPTY}
          onClose={() => setOpen(false)}
          onSave={async (f) => {
            await createProfileField(f);
            setOpen(false);
            props.onCreated();
          }}
        />
      </Show>
    </>
  );
}

// ── Custom field row ──────────────────────────────────────────────────────────

function CustomFieldRow(props: { field: ProfdefField; onChanged: () => void }) {
  const [editing, setEditing] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);

  async function onDelete() {
    setDeleting(true);
    try {
      await deleteProfileField(props.field.id);
      props.onChanged();
    } catch { setDeleting(false); }
  }

  return (
    <>
      <div class="flex items-center gap-3 px-3 py-2.5 border-b border-rim last:border-0
                  hover:bg-elevated/50 transition-colors">
        <span class="text-sm font-mono text-txt w-32 shrink-0 truncate">{props.field.field_name}</span>
        <span class="text-sm text-muted flex-1 truncate">{props.field.field_desc || "—"}</span>
        <div class="flex items-center gap-2 shrink-0">
          <button
            onClick={onDelete}
            disabled={deleting()}
            class="flex items-center gap-1 px-2 py-1 text-xs rounded border border-red-300 text-red-600
                   hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20
                   disabled:opacity-50 transition-colors"
          >
            🗑 Delete
          </button>
          <button
            onClick={() => setEditing(true)}
            class="px-2 py-1 text-xs rounded border border-rim text-muted hover:bg-elevated transition-colors"
          >
            ✏
          </button>
        </div>
      </div>

      <Show when={editing()}>
        <FieldModal
          title="Edit Profile Field"
          initial={props.field}
          onClose={() => setEditing(false)}
          onSave={async (f) => {
            await updateProfileField(props.field.id, f);
            setEditing(false);
            props.onChanged();
          }}
        />
      </Show>
    </>
  );
}

// ── Shared create/edit modal ──────────────────────────────────────────────────

function FieldModal(props: {
  title: string;
  initial: Omit<ProfdefField, "id">;
  onClose: () => void;
  onSave: (f: Omit<ProfdefField, "id">) => Promise<void>;
}) {
  const [form, setForm] = createSignal({ ...props.initial });
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  const set = (k: keyof Omit<ProfdefField, "id">) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const f = form();
    if (!f.field_name.trim()) { setError("Field nickname is required."); return; }
    setSaving(true);
    setError("");
    try {
      await props.onSave(f);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
    }
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div class="w-full max-w-md rounded-xl border border-rim bg-base shadow-xl">
        <div class="flex items-center justify-between px-4 py-3 border-b border-rim">
          <h3 class="text-sm font-semibold text-txt">{props.title}</h3>
          <button onClick={props.onClose} class="text-muted hover:text-txt text-lg leading-none">×</button>
        </div>

        <form onSubmit={onSubmit} class="p-4 space-y-4">
          <FormField label="Field nickname" hint="System name of field">
            <input
              type="text"
              value={form().field_name}
              onInput={(e) => set("field_name")(e.currentTarget.value)}
              class={inputCls}
              placeholder="e.g. my_custom_field"
            />
          </FormField>

          <FormField label="Input type">
            <select
              value={form().field_type}
              onChange={(e) => set("field_type")(e.currentTarget.value)}
              class={inputCls}
            >
              <For each={FIELD_TYPES}>
                {(t) => <option value={t}>{t}</option>}
              </For>
            </select>
          </FormField>

          <FormField label="Field Name" hint="Label on profile pages">
            <input
              type="text"
              value={form().field_desc}
              onInput={(e) => set("field_desc")(e.currentTarget.value)}
              class={inputCls}
            />
          </FormField>

          <Show when={form().field_type === "select"}>
            <FormField label="Choices" hint="One per line — what the dropdown offers">
              <textarea
                rows={4}
                value={form().field_inputs}
                onInput={(e) => set("field_inputs")(e.currentTarget.value)}
                class={inputCls}
                placeholder={"Apprentice\nJourneyman\nMaster"}
              />
            </FormField>
          </Show>

          <FormField label="Help text" hint="Additional info (optional)">
            <input
              type="text"
              value={form().field_help}
              onInput={(e) => set("field_help")(e.currentTarget.value)}
              class={inputCls}
            />
          </FormField>

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
              {saving() ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField(props: { label: string; hint?: string; children: any }) {
  return (
    <div class="space-y-1">
      <label class="text-sm font-medium text-txt">{props.label}</label>
      {props.children}
      <Show when={props.hint}>
        <p class="text-xs text-muted">{props.hint}</p>
      </Show>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-1.5 text-sm rounded-lg border border-rim bg-surface text-txt " +
  "placeholder:text-muted focus:outline-none focus:border-accent";

function Skeleton() {
  return (
    <div class="space-y-4 animate-pulse">
      <div class="h-20 rounded-lg border border-rim bg-elevated/30" />
      <div class="h-32 rounded-lg border border-rim bg-elevated/30" />
      <div class="h-24 rounded-lg border border-rim bg-elevated/30" />
    </div>
  );
}
