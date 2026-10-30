/**
 * usePollState.ts
 * Poll state extracted from PostComposer — gated by CAPABILITIES[flavor].poll
 * (currently only "post"). Article's duplicate poll feature was removed
 * entirely rather than ported over.
 */

import { createSignal } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";

export interface PollFormPayload {
  answers: string[];
  expireValue: string;
  expireUnit: string;
  multiple: boolean;
}

export interface PollState {
  enabled: () => boolean;
  setEnabled: (updater: boolean | ((prev: boolean) => boolean)) => void;
  answers: () => string[];
  updateAnswer: (i: number, val: string) => void;
  addAnswer: () => void;
  removeAnswer: (i: number) => void;
  expireValue: () => string;
  setExpireValue: (v: string) => void;
  expireUnit: () => string;
  setExpireUnit: (v: string) => void;
  multiple: () => boolean;
  setMultiple: (v: boolean) => void;
  reset: () => void;
  /**
   * Returns null when the poll is off. Throws when on but fewer than 2
   * non-blank answers remain (matches the original inline validation).
   */
  toFormPayload: () => PollFormPayload | null;
}

export function usePollState(): PollState {
  const { t } = useI18n();
  const [enabled, setEnabled] = createSignal(false);
  const [answers, setAnswers] = createSignal<string[]>(["", ""]);
  const [expireValue, setExpireValue] = createSignal("1");
  const [expireUnit, setExpireUnit] = createSignal("Days");
  const [multiple, setMultiple] = createSignal(false);

  function updateAnswer(i: number, val: string) {
    setAnswers((prev) => prev.map((a, j) => (j === i ? val : a)));
  }
  function addAnswer() {
    if (answers().length < 10) setAnswers((prev) => [...prev, ""]);
  }
  function removeAnswer(i: number) {
    setAnswers((prev) => prev.filter((_, j) => j !== i));
  }

  function reset() {
    setEnabled(false);
    setAnswers(["", ""]);
    setExpireValue("1");
    setExpireUnit("Days");
    setMultiple(false);
  }

  function toFormPayload(): PollFormPayload | null {
    if (!enabled()) return null;
    const filled = answers().filter((a) => a.trim());
    if (filled.length < 2) {
      throw new Error(t("editor.poll_min_answers"));
    }
    return { answers: filled, expireValue: expireValue(), expireUnit: expireUnit(), multiple: multiple() };
  }

  return {
    enabled,
    setEnabled,
    answers,
    updateAnswer,
    addAnswer,
    removeAnswer,
    expireValue,
    setExpireValue,
    expireUnit,
    setExpireUnit,
    multiple,
    setMultiple,
    reset,
    toFormPayload,
  };
}
