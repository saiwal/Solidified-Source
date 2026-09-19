import { createSignal, createMemo, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchPermcatDetail, updatePermcatPerms } from "../../connections/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineClose } from "solid-icons/md";

interface Props {
  name: string;
  label: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function RolePermissionsModal(props: Props) {
  const { t } = useI18n();
  const [detail, { mutate }] = createQueryResource(
    "permcat-detail",
    () => props.name,
    (name) => fetchPermcatDetail(name),
  );

  const [checked, setChecked] = createSignal<Set<string> | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Seed local editable state once the detail loads.
  const perms = createMemo(() => {
    const d = detail();
    if (d && checked() === null) {
      setChecked(new Set(d.perms.filter((p) => p.value).map((p) => p.key)));
    }
    return d?.perms ?? [];
  });

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    const set = checked();
    if (!set) return;
    setSaving(true);
    setError(null);
    try {
      await updatePermcatPerms(props.name, [...set]);
      mutate((prev) =>
        prev ? { ...prev, perms: prev.perms.map((p) => ({ ...p, value: set.has(p.key) })) } : prev,
      );
      props.onSaved();
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div class="w-full max-w-md rounded-2xl bg-surface border border-rim shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          {/* Header */}
          <div class="flex items-center gap-3 p-4 border-b border-rim shrink-0">
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-sm text-txt truncate">
                {t("directory.role_perms_title")}
              </div>
              <div class="text-xs text-muted truncate">{props.label}</div>
            </div>
            <button
              onClick={props.onClose}
              class="p-1.5 rounded-lg text-muted hover:text-txt hover:bg-overlay transition-colors shrink-0"
              aria-label={t("directory.cancel")}
            >
              <MdOutlineClose class="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div class="flex-1 overflow-y-auto p-4 space-y-3">
            <p class="text-xs text-muted">{t("directory.role_perms_desc")}</p>

            <Show
              when={!detail.loading}
              fallback={
                <div class="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                  <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {t("directory.role_perms_loading")}
                </div>
              }
            >
              <ul class="divide-y divide-rim/50">
                <For each={perms()}>
                  {(perm) => (
                    <li class="flex items-start gap-3 py-2.5">
                      <input
                        type="checkbox"
                        id={`perm-${perm.key}`}
                        checked={checked()?.has(perm.key) ?? false}
                        onChange={() => toggle(perm.key)}
                        class="mt-0.5 w-4 h-4 accent-accent shrink-0"
                      />
                      <label for={`perm-${perm.key}`} class="flex-1 min-w-0 cursor-pointer">
                        <div class="text-sm text-txt leading-snug">{perm.label}</div>
                        <Show when={perm.inherited}>
                          <div class="text-[0.625rem] text-red-500 mt-0.5">
                            {t("directory.role_perms_inherited")}
                          </div>
                        </Show>
                      </label>
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <Show when={error()}>
              <p class="text-xs text-red-500">{error()}</p>
            </Show>
          </div>

          {/* Footer */}
          <div class="flex items-center gap-2 px-4 py-3 border-t border-rim shrink-0">
            <div class="flex-1" />
            <button
              onClick={props.onClose}
              class="px-3 py-1.5 rounded-lg text-xs border border-rim text-muted
                     hover:bg-overlay transition-colors"
            >
              {t("directory.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={saving() || detail.loading}
              class="px-3 py-1.5 rounded-lg text-xs border border-rim text-muted
                     hover:border-accent hover:text-accent transition-colors
                     disabled:opacity-50 disabled:cursor-default flex items-center gap-1.5"
            >
              <Show when={saving()}>
                <span class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              </Show>
              {saving() ? t("directory.saving") : t("directory.save")}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
