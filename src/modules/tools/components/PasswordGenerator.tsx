import { createSignal, createMemo } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Card } from "@ui/Card";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}|;:,.<>?";
const AMBIGUOUS = /[0Ol1I]/g;

function entropy(charsetSize: number, length: number): number {
  return length * Math.log2(charsetSize);
}

function strengthLabel(bits: number): { labelKey: string; color: string; width: string } {
  if (bits < 40) return { labelKey: "tools.pw_weak",        color: "bg-danger",    width: "w-1/4" };
  if (bits < 60) return { labelKey: "tools.pw_fair",        color: "bg-warning",  width: "w-2/4" };
  if (bits < 80) return { labelKey: "tools.pw_strong",      color: "bg-success",  width: "w-3/4" };
  return              { labelKey: "tools.pw_very_strong",  color: "bg-accent",     width: "w-full" };
}

function generate(opts: {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  noAmbiguous: boolean;
}): string {
  let charset = "";
  if (opts.lower)   charset += LOWER;
  if (opts.upper)   charset += UPPER;
  if (opts.digits)  charset += DIGITS;
  if (opts.symbols) charset += SYMBOLS;
  if (opts.noAmbiguous) charset = charset.replace(AMBIGUOUS, "");
  if (!charset) return "";

  const arr = new Uint32Array(opts.length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => charset[n % charset.length]).join("");
}

export function PasswordGenerator() {
  const { t } = useI18n();
  const [length, setLength] = createSignal(20);
  const [lower, setLower] = createSignal(true);
  const [upper, setUpper] = createSignal(true);
  const [digits, setDigits] = createSignal(true);
  const [symbols, setSymbols] = createSignal(false);
  const [noAmbiguous, setNoAmbiguous] = createSignal(false);
  const [password, setPassword] = createSignal("");
  const [copied, setCopied] = createSignal(false);
  const [history, setHistory] = createSignal<string[]>([]);

  const charsetSize = createMemo(() => {
    let n = 0;
    if (lower()) n += LOWER.length;
    if (upper()) n += UPPER.length;
    if (digits()) n += DIGITS.length;
    if (symbols()) n += SYMBOLS.length;
    if (noAmbiguous()) n = Math.max(n - 6, 1);
    return n;
  });

  const bits = createMemo(() => entropy(charsetSize(), length()));
  const strength = createMemo(() => strengthLabel(bits()));

  const regen = () => {
    const pw = generate({
      length: length(),
      lower: lower(),
      upper: upper(),
      digits: digits(),
      symbols: symbols(),
      noAmbiguous: noAmbiguous(),
    });
    setPassword(pw);
    if (pw) setHistory((h) => [pw, ...h].slice(0, 5));
  };

  const copy = async (pw: string) => {
    await navigator.clipboard.writeText(pw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Generate on first render
  if (!password()) regen();

  const CheckBox = (props: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <label class="flex items-center gap-2.5 cursor-pointer select-none text-sm text-txt">
      <input
        type="checkbox"
        class="w-4 h-4 accent-accent rounded"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      {props.label}
    </label>
  );

  return (
    <div class="flex flex-col gap-5 max-w-sm w-full mx-auto">
      {/* Password display */}
      <Card class="px-4 py-3 flex items-center gap-3">
        <span class="font-mono text-txt text-base flex-1 break-all select-all">
          {password() || <span class="text-muted">{t("tools.pw_select_charset")}</span>}
        </span>
        <Button variant="ghost" size="sm" class="shrink-0" onClick={() => copy(password())}>
          {copied() ? t("tools.pw_copied") : t("tools.pw_copy")}
        </Button>
      </Card>

      {/* Strength bar */}
      {password() && (
        <div class="flex flex-col gap-1.5">
          <div class="flex justify-between text-xs text-muted">
            <span>{t(strength().labelKey as any)}</span>
            <span>{Math.round(bits())} {t("tools.pw_bits")}</span>
          </div>
          <div class="h-1.5 bg-elevated rounded-full overflow-hidden">
            <div class={`h-full rounded-full transition-all ${strength().color} ${strength().width}`} />
          </div>
        </div>
      )}

      {/* Length slider */}
      <div class="flex flex-col gap-2">
        <div class="flex justify-between text-sm">
          <span class="text-muted">{t("tools.pw_length")}</span>
          <span class="text-txt font-mono">{length()}</span>
        </div>
        <input
          type="range" min={4} max={128} step={1}
          value={length()}
          class="w-full"
          onInput={(e) => setLength(Number(e.currentTarget.value))}
          onMouseUp={regen}
          onTouchEnd={regen}
        />
      </div>

      {/* Options */}
      <Card class="grid grid-cols-2 gap-3 p-4">
        <CheckBox label={t("tools.pw_lowercase")} checked={lower()} onChange={setLower} />
        <CheckBox label={t("tools.pw_uppercase")} checked={upper()} onChange={setUpper} />
        <CheckBox label={t("tools.pw_digits")}    checked={digits()} onChange={setDigits} />
        <CheckBox label={t("tools.pw_symbols")}   checked={symbols()} onChange={setSymbols} />
        <div class="col-span-2">
          <CheckBox label={t("tools.pw_no_ambiguous")} checked={noAmbiguous()} onChange={setNoAmbiguous} />
        </div>
      </Card>

      {/* Generate button */}
      <Button class="active:scale-95" onClick={regen}>
        {t("tools.pw_generate")}
      </Button>

      {/* History */}
      {history().length > 1 && (
        <div class="flex flex-col gap-1.5">
          <p class="text-xs text-muted">{t("tools.pw_recent")}</p>
          {history().slice(1).map((pw) => (
            <Card class="flex items-center gap-2 px-3 py-2">
              <span class="font-mono text-xs text-muted flex-1 truncate">{pw}</span>
              <button
                onClick={() => copy(pw)}
                class="text-xs text-muted hover:text-txt transition-colors shrink-0"
              >
                {t("tools.pw_copy")}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
