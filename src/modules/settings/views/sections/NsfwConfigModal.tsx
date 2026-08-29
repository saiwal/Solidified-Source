import { createSignal, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { inputClass } from "../../store/FormHelpers";
import { useI18n } from "@utsukta/spa-core/i18n";
import ConfigModal from "./ConfigModal";

interface NsfwSettings {
  nsfw_words: string;
  nsfw_installed: boolean;
}

async function fetchNsfwSettings(): Promise<NsfwSettings> {
  const res = await apiFetch("/spa/settings/privacy");
  const { data } = await res.json();
  return { nsfw_words: data.nsfw_words, nsfw_installed: data.nsfw_installed };
}

async function saveNsfwWords(words: string): Promise<void> {
  const res = await apiFetch("/spa/settings/privacy", {
    method: "POST",
    body: JSON.stringify({ nsfw_words: words }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error?.message ?? "Save failed");
  }
}

export default function NsfwConfigModal(props: { onClose: () => void }) {
  const { t } = useI18n();
  const [data] = createQueryResource("nsfw-config", fetchNsfwSettings);
  const [words, setWords] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Seed local editable state once the fetch resolves.
  const loaded = () => {
    const d = data();
    if (d && words() === null) setWords(d.nsfw_words);
    return d;
  };

  async function handleSave() {
    const w = words();
    if (w === null) return;
    setSaving(true);
    setError(null);
    try {
      await saveNsfwWords(w);
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConfigModal
      title={t("settings.privacy_nsfw")}
      description={t("settings.privacy_nsfw_desc")}
      saving={saving()}
      saveDisabled={words() === null}
      error={error()}
      onSave={handleSave}
      onClose={props.onClose}
    >
      <Show
        when={loaded()}
        fallback={
          <div class="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-txt">{t("settings.privacy_nsfw_words")}</label>
          <textarea
            rows="3"
            value={words() ?? ""}
            onInput={(e) => setWords(e.currentTarget.value)}
            class={inputClass}
          />
          <p class="text-xs text-muted">{t("settings.privacy_nsfw_words_hint")}</p>
          <Show when={!loaded()!.nsfw_installed}>
            <p class="text-xs text-amber-500">{t("settings.privacy_nsfw_app_hint")}</p>
          </Show>
        </div>
      </Show>
    </ConfigModal>
  );
}
