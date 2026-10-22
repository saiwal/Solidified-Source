import { createSignal, For, createMemo } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Field, Input, Select } from "@ui/Field";

type Category = {
  label: string;
  units: { label: string; toBase: (v: number) => number; fromBase: (v: number) => number }[];
};

const CATEGORIES: Record<string, Category> = {
  length: {
    label: "Length",
    units: [
      { label: "Millimeters (mm)", toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      { label: "Centimeters (cm)", toBase: (v) => v / 100, fromBase: (v) => v * 100 },
      { label: "Meters (m)",       toBase: (v) => v,         fromBase: (v) => v },
      { label: "Kilometers (km)",  toBase: (v) => v * 1000,  fromBase: (v) => v / 1000 },
      { label: "Inches (in)",      toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
      { label: "Feet (ft)",        toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
      { label: "Miles (mi)",       toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
    ],
  },
  weight: {
    label: "Weight",
    units: [
      { label: "Milligrams (mg)", toBase: (v) => v / 1e6,   fromBase: (v) => v * 1e6 },
      { label: "Grams (g)",       toBase: (v) => v / 1000,  fromBase: (v) => v * 1000 },
      { label: "Kilograms (kg)",  toBase: (v) => v,          fromBase: (v) => v },
      { label: "Metric tons (t)", toBase: (v) => v * 1000,   fromBase: (v) => v / 1000 },
      { label: "Ounces (oz)",     toBase: (v) => v * 0.028349523125, fromBase: (v) => v / 0.028349523125 },
      { label: "Pounds (lb)",     toBase: (v) => v * 0.45359237, fromBase: (v) => v / 0.45359237 },
    ],
  },
  temperature: {
    label: "Temperature",
    units: [
      { label: "Celsius (°C)",    toBase: (v) => v,              fromBase: (v) => v },
      { label: "Fahrenheit (°F)", toBase: (v) => (v - 32) * 5/9, fromBase: (v) => v * 9/5 + 32 },
      { label: "Kelvin (K)",      toBase: (v) => v - 273.15,      fromBase: (v) => v + 273.15 },
    ],
  },
  area: {
    label: "Area",
    units: [
      { label: "Square mm (mm²)",  toBase: (v) => v / 1e6, fromBase: (v) => v * 1e6 },
      { label: "Square cm (cm²)",  toBase: (v) => v / 1e4, fromBase: (v) => v * 1e4 },
      { label: "Square m (m²)",    toBase: (v) => v,        fromBase: (v) => v },
      { label: "Square km (km²)",  toBase: (v) => v * 1e6,  fromBase: (v) => v / 1e6 },
      { label: "Acres",            toBase: (v) => v * 4046.8564224, fromBase: (v) => v / 4046.8564224 },
      { label: "Hectares (ha)",    toBase: (v) => v * 10000, fromBase: (v) => v / 10000 },
      { label: "Square miles",     toBase: (v) => v * 2589988.110336, fromBase: (v) => v / 2589988.110336 },
    ],
  },
  speed: {
    label: "Speed",
    units: [
      { label: "m/s",   toBase: (v) => v,       fromBase: (v) => v },
      { label: "km/h",  toBase: (v) => v / 3.6, fromBase: (v) => v * 3.6 },
      { label: "mph",   toBase: (v) => v * 0.44704, fromBase: (v) => v / 0.44704 },
      { label: "knots", toBase: (v) => v * 0.514444, fromBase: (v) => v / 0.514444 },
    ],
  },
  data: {
    label: "Data",
    units: [
      { label: "Bits (b)",      toBase: (v) => v / 8,          fromBase: (v) => v * 8 },
      { label: "Bytes (B)",     toBase: (v) => v,               fromBase: (v) => v },
      { label: "Kilobytes (KB)", toBase: (v) => v * 1024,       fromBase: (v) => v / 1024 },
      { label: "Megabytes (MB)", toBase: (v) => v * 1048576,    fromBase: (v) => v / 1048576 },
      { label: "Gigabytes (GB)", toBase: (v) => v * 1073741824, fromBase: (v) => v / 1073741824 },
      { label: "Terabytes (TB)", toBase: (v) => v * 1099511627776, fromBase: (v) => v / 1099511627776 },
    ],
  },
};

const fmt = (n: number) => {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9 || (Math.abs(n) < 0.0001 && n !== 0)) return n.toExponential(4);
  return parseFloat(n.toPrecision(8)).toString();
};

export function UnitConverter() {
  const { t } = useI18n();
  const [category, setCategory] = createSignal<string>("length");
  const [fromIdx, setFromIdx] = createSignal(0);
  const [toIdx, setToIdx] = createSignal(1);
  const [inputVal, setInputVal] = createSignal("1");

  const units = createMemo(() => CATEGORIES[category()].units);

  const result = createMemo(() => {
    const v = parseFloat(inputVal());
    if (isNaN(v)) return "";
    const base = units()[fromIdx()].toBase(v);
    return fmt(units()[toIdx()].fromBase(base));
  });

  const swap = () => {
    const tmp = fromIdx();
    setFromIdx(toIdx());
    setToIdx(tmp);
  };

  const inputCls = "bg-surface border border-rim text-txt hover:border-rim-strong focus:outline-none rounded-xl px-4 py-3 text-sm font-mono w-full";

  return (
    <div class="flex flex-col gap-5 max-w-sm w-full mx-auto">
      {/* Category tabs */}
      <div class="flex flex-wrap gap-1.5">
        <For each={Object.entries(CATEGORIES)}>
          {([key, cat]) => (
            <button
              onClick={() => { setCategory(key); setFromIdx(0); setToIdx(1); }}
              class={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                category() === key
                  ? "bg-elevated text-txt border-rim-strong"
                  : "text-muted border-rim hover:bg-elevated hover:text-txt"
              }`}
            >
              {cat.label}
            </button>
          )}
        </For>
      </div>

      {/* From */}
      <div class="flex flex-col gap-2">
        <Field label={t("tools.unit_from")}>
          <Select class="w-full" value={fromIdx()} onInput={(e) => setFromIdx(Number(e.currentTarget.value))}>
          <For each={units()}>
          {(u, i) => <option value={i()}>{u.label}</option>}
          </For>
          </Select>
        </Field>
        <Input
          class="font-mono w-full"
          type="number"
          value={inputVal()}
          onInput={(e) => setInputVal(e.currentTarget.value)}
          placeholder="0"
        />
      </div>

      {/* Swap */}
      <button
        onClick={swap}
        class="self-center border border-rim text-muted hover:bg-elevated hover:text-txt rounded-full w-9 h-9 flex items-center justify-center text-lg transition-colors"
        title={t("tools.unit_swap")}
      >
        ⇅
      </button>

      {/* To */}
      <div class="flex flex-col gap-2">
        <Field label={t("tools.unit_to")}>
          <Select class="w-full" value={toIdx()} onInput={(e) => setToIdx(Number(e.currentTarget.value))}>
          <For each={units()}>
          {(u, i) => <option value={i()}>{u.label}</option>}
          </For>
          </Select>
        </Field>
        <div class={`${inputCls} bg-elevated text-txt cursor-default`}>
          {result() !== "" ? result() : <span class="text-muted">—</span>}
        </div>
      </div>
    </div>
  );
}
