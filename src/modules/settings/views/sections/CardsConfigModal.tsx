// Cards app config, opened from the gear on its Integrations row. Just the
// kanban board switch today — the board is a view inside the Cards app rather
// than an app of its own, so it belongs here and not as its own list row.

import { createSignal } from "solid-js";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useI18n } from "@utsukta/spa-core/i18n";
import { SwitchRow } from "../../store/FormHelpers";
import ConfigModal from "./ConfigModal";

async function saveKanban(enabled: boolean): Promise<void> {
  const res = await apiFetch("/spa/settings/integrations", {
    method: "POST",
    body: JSON.stringify({ action: "kanban", enabled: enabled ? 1 : 0 }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error?.message ?? "Save failed");
  }
}

export default function CardsConfigModal(props: {
  kanban: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [kanban, setKanban] = createSignal(props.kanban);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveKanban(kanban());
      props.onSaved();
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConfigModal
      title={t("settings.cards_config")}
      description={t("settings.cards_config_desc")}
      saving={saving()}
      error={error()}
      onSave={handleSave}
      onClose={props.onClose}
    >
      <SwitchRow
        name="kanban"
        label={t("settings.integ_kanban")}
        hint={t("settings.integ_kanban_desc")}
        checked={kanban()}
        onChange={setKanban}
      />
    </ConfigModal>
  );
}
