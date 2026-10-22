import { isolate } from "@utsukta/spa-core/lib/isolate";
import { createSignal, createMemo, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchPermcatDetail, updatePermcatPerms } from "../../connections/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Modal, ModalPanel } from "@ui/Modal";
import { Button } from "@ui/Button";
import { Spinner } from "@ui/Spinner";

interface Props {
  name: string;
  label: string;
  onClose: () => void;
  onSaved: () => void;
}

function RolePermissionsModal(props: Props) {
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
    <Modal onClose={props.onClose} class="z-[60]">
      <ModalPanel
        title={t("directory.role_perms_title")}
        description={props.label}
        onClose={props.onClose}
        size="md"
        class="overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}

        {/* Body */}
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <p class="text-xs text-muted">{t("directory.role_perms_desc")}</p>

          <Show
            when={!detail.loading}
            fallback={
              <div class="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                <Spinner size="md" />
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
                        <div class="text-[0.625rem] text-danger-txt mt-0.5">
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
            <p class="text-xs text-danger-txt">{error()}</p>
          </Show>
        </div>

        {/* Footer */}
        <div class="flex items-center gap-2 px-4 py-3 border-t border-rim shrink-0">
          <div class="flex-1" />
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            {t("directory.cancel")}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={saving() || detail.loading}>
            <Show when={saving()}>
              <Spinner size="xs" />
            </Show>
            {saving() ? t("directory.saving") : t("directory.save")}
          </Button>
        </div>
      </ModalPanel>
    </Modal>
  );
}

// Own boundary: its data reads would otherwise suspend the page it opens over.
export default isolate(RolePermissionsModal);
