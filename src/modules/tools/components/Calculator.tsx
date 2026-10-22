import { createSignal } from "solid-js";
import { Card } from "@ui/Card";

type CalcOp = "+" | "-" | "×" | "÷" | null;

export function Calculator() {
  const [display, setDisplay] = createSignal("0");
  const [prev, setPrev] = createSignal<number | null>(null);
  const [op, setOp] = createSignal<CalcOp>(null);
  const [waitingForOperand, setWaitingForOperand] = createSignal(false);

  const inputDigit = (digit: string) => {
    if (waitingForOperand()) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display() === "0" ? digit : display() + digit);
    }
  };

  const inputDot = () => {
    if (waitingForOperand()) {
      setDisplay("0.");
      setWaitingForOperand(false);
      return;
    }
    if (!display().includes(".")) setDisplay(display() + ".");
  };

  const handleOp = (nextOp: CalcOp) => {
    const val = parseFloat(display());
    if (prev() !== null && op() && !waitingForOperand()) {
      const result = compute(prev()!, op()!, val);
      setDisplay(String(parseFloat(result.toFixed(10))));
      setPrev(result);
    } else {
      setPrev(val);
    }
    setOp(nextOp);
    setWaitingForOperand(true);
  };

  const compute = (a: number, operator: CalcOp, b: number): number => {
    switch (operator) {
      case "+": return a + b;
      case "-": return a - b;
      case "×": return a * b;
      case "÷": return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const equals = () => {
    const val = parseFloat(display());
    if (prev() !== null && op()) {
      const result = compute(prev()!, op()!, val);
      setDisplay(String(parseFloat(result.toFixed(10))));
      setPrev(null);
      setOp(null);
      setWaitingForOperand(true);
    }
  };

  const clear = () => {
    setDisplay("0");
    setPrev(null);
    setOp(null);
    setWaitingForOperand(false);
  };

  const toggleSign = () => {
    setDisplay(String(parseFloat(display()) * -1));
  };

  const percent = () => {
    setDisplay(String(parseFloat(display()) / 100));
  };

  const btnBase =
    "flex items-center justify-center rounded-xl text-xl font-medium h-14 cursor-pointer select-none transition-all active:scale-95";

  const BtnNum = (props: { label: string; onClick: () => void }) => (
    <button
      class={`${btnBase} bg-surface border border-rim hover:border-rim-strong text-txt`}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );

  const BtnMod = (props: { label: string; onClick: () => void }) => (
    <button
      class={`${btnBase} bg-elevated border border-rim text-muted hover:text-txt`}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );

  const BtnOp = (props: { label: string; onClick: () => void; active?: boolean }) => (
    <button
      class={`${btnBase} border ${props.active ? "bg-accent text-accent-fg border-transparent" : "bg-accent-muted text-accent border-rim hover:border-rim-strong"}`}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );

  return (
    <div class="flex flex-col items-center gap-4">
      {/* Display */}
      <Card class="w-full max-w-xs px-5 py-4">
        <div class="text-muted text-sm h-5 text-right">
          {prev() !== null ? `${prev()} ${op() ?? ""}` : ""}
        </div>
        <div class="text-txt text-right font-mono text-4xl truncate mt-1">
          {display()}
        </div>
      </Card>

      {/* Keypad */}
      <div class="grid grid-cols-4 gap-2.5 w-full max-w-xs">
        <BtnMod label="AC" onClick={clear} />
        <BtnMod label="+/-" onClick={toggleSign} />
        <BtnMod label="%" onClick={percent} />
        <BtnOp label="÷" onClick={() => handleOp("÷")} active={op() === "÷"} />

        {["7", "8", "9"].map((d) => <BtnNum label={d} onClick={() => inputDigit(d)} />)}
        <BtnOp label="×" onClick={() => handleOp("×")} active={op() === "×"} />

        {["4", "5", "6"].map((d) => <BtnNum label={d} onClick={() => inputDigit(d)} />)}
        <BtnOp label="-" onClick={() => handleOp("-")} active={op() === "-"} />

        {["1", "2", "3"].map((d) => <BtnNum label={d} onClick={() => inputDigit(d)} />)}
        <BtnOp label="+" onClick={() => handleOp("+")} active={op() === "+"} />

        <BtnNum label="0" onClick={() => inputDigit("0")} />
        <BtnNum label="." onClick={inputDot} />
        <div class="col-span-2">
          <button
            class={`${btnBase} w-full bg-accent text-accent-fg border-transparent hover:opacity-90`}
            onClick={equals}
          >
            =
          </button>
        </div>
      </div>
    </div>
  );
}
