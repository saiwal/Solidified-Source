import { createSignal, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";

// Name entry form for creating or renaming a layout template — used by both
// the Layout Templates management screen and the inline "+ New template"
// flow in WebpageComposer.
export default function TemplateNameForm(props: {
  initial?: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = createSignal(props.initial ?? "");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await props.onSubmit(name().trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card class="p-3 space-y-2">
      <Input
        class="w-full"
        type="text"
        value={name()}
        maxLength={60}
        placeholder={t("webpages.template_name_placeholder") as string}
        onInput={(e) => setName(e.currentTarget.value)}
      />
      <Show when={error()}>
        <p class="text-xs text-danger-txt">{error()}</p>
      </Show>
      <div class="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={props.onCancel}>
          {t("webpages.cancel")}
        </Button>
        <Button size="sm" onClick={submit} disabled={busy() || !name().trim()}>
          {t("webpages.save")}
        </Button>
      </div>
    </Card>
  );
}
