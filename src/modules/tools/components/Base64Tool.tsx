import { createSignal } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Field, Textarea } from "@ui/Field";

type Mode = "encode" | "decode";

function encodeBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return "Error: could not encode input.";
  }
}

function decodeBase64(str: string): string {
  try {
    return decodeURIComponent(escape(atob(str.trim())));
  } catch {
    return "Error: invalid Base64 input.";
  }
}

export function Base64Tool() {
  const { t } = useI18n();
  const [mode, setMode] = createSignal<Mode>("encode");
  const [input, setInput] = createSignal("");
  const [copied, setCopied] = createSignal(false);

  const output = () => {
    const val = input().trim();
    if (!val) return "";
    return mode() === "encode" ? encodeBase64(val) : decodeBase64(val);
  };

  const copyOutput = async () => {
    const out = output();
    if (!out) return;
    await navigator.clipboard.writeText(out);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const swap = () => {
    const out = output();
    setInput(out);
    setMode((m) => (m === "encode" ? "decode" : "encode"));
  };

  return (
    <div class="flex flex-col gap-5 max-w-lg w-full mx-auto">
      {/* Mode toggle */}
      <div class="flex gap-2 self-start bg-elevated border border-rim rounded-xl p-1">
        {(["encode", "decode"] as Mode[]).map((m) => (
          <Button
            variant="ghost"
            size="sm"
            pressed={mode() === m}
            class="capitalize"
            onClick={() => setMode(m)}
          >
            {m === "encode" ? t("tools.base64_encode") : t("tools.base64_decode")}
          </Button>
        ))}
      </div>

      {/* Input */}
      <div class="flex flex-col gap-2">
        <Field label={mode() === "encode" ? t("tools.base64_plain") : t("tools.base64_input")}>
          <Textarea
          class="font-mono w-full resize-none"
          rows={5}
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder={mode() === "encode" ? "Enter text to encode…" : "Enter Base64 to decode…"}
          />
        </Field>
      </div>

      {/* Output */}
      {output() && (
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <label class="text-sm text-muted">
              {mode() === "encode" ? t("tools.base64_output") : t("tools.base64_decoded")}
            </label>
            <div class="flex gap-2">
              <Button variant="ghost" size="sm" onClick={swap} title={t("tools.base64_use_input")}>
                {t("tools.base64_use_input")}
              </Button>
              <Button variant="ghost" size="sm" onClick={copyOutput}>
                {copied() ? t("tools.base64_copied") : t("tools.base64_copy")}
              </Button>
            </div>
          </div>
          <Textarea class="font-mono w-full resize-none cursor-default" rows={5} readonly value={output()} />
        </div>
      )}

      {/* File input — encode a file's bytes */}
      <div class="border-t border-rim pt-4 flex flex-col gap-2">
        <label class="text-sm text-muted">{t("tools.base64_encode_file")}</label>
        <input
          type="file"
          class="text-sm text-muted file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border file:border-rim file:bg-surface file:text-muted hover:file:bg-elevated cursor-pointer"
          onInput={(e) => {
            const file = e.currentTarget.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              // result is a data URL; strip the prefix to get raw base64
              const b64 = (reader.result as string).split(",")[1] ?? "";
              setInput(b64);
              setMode("decode"); // they probably want to decode back, or just inspect
              setMode("encode"); // reset so output shows encoded value
            };
            reader.readAsDataURL(file);
          }}
        />
        <p class="text-xs text-muted">{t("tools.base64_file_note")}</p>
      </div>
    </div>
  );
}
