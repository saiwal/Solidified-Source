import { createSignal, createEffect, on } from "solid-js";
import { toast } from "@utsukta/spa-core/store/toast";
import QRCode from "qrcode";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Field, Textarea } from "@ui/Field";

export function QRGenerator() {
  const { t } = useI18n();
  const [text, setText] = createSignal("https://hz-ddev.ddev.site");
  const [size, setSize] = createSignal(240);
  const [dataUrl, setDataUrl] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(async () => {
    const val = text().trim();
    if (!val) { setDataUrl(null); return; }
    setError(null);
    try {
      const url = await QRCode.toDataURL(val, {
        width: size(),
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      setDataUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate QR code.");
      setDataUrl(null);
    }
  });

  createEffect(on(error, (err, prev) => { if (err && !prev) toast.error(err); }));

  const download = () => {
    if (!dataUrl()) return;
    const a = document.createElement("a");
    a.href = dataUrl()!;
    a.download = "qrcode.png";
    a.click();
  };

  return (
    <div class="flex flex-col gap-5 items-center max-w-sm w-full mx-auto">
      <div class="w-full flex flex-col gap-2">
        <Field label={t("tools.qr_text_label")}>
          <Textarea
          class="resize-none w-full"
          rows={3}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          placeholder={t("tools.qr_placeholder")}
          />
        </Field>
      </div>

      <div class="w-full flex flex-col gap-2">
        <div class="flex justify-between text-sm">
          <span class="text-muted">{t("tools.qr_size")}</span>
          <span class="text-txt font-mono">{size()}px</span>
        </div>
        <input
          type="range" min={128} max={512} step={8}
          value={size()}
          class="w-full"
          onInput={(e) => setSize(Number(e.currentTarget.value))}
        />
      </div>

      {dataUrl() && (
        <div class="flex flex-col items-center gap-4">
          <div class="bg-elevated p-3 rounded-xl border border-rim">
            <img
              src={dataUrl()!}
              alt="Generated QR code"
              class="block"
              style={{ width: `${Math.min(size(), 280)}px`, height: `${Math.min(size(), 280)}px` }}
            />
          </div>
          <Button variant="ghost" onClick={download}>
            {t("tools.qr_download")}
          </Button>
        </div>
      )}
    </div>
  );
}
