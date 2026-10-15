import { persistedSignal, boolFlag } from "../lib/persisted";

const [enabled, setEnabled] = persistedSignal(
  "hz-emoji-as-images",
  true, // core default: pconfig system/no_smilies unset = images on
  boolFlag.parse,
  boolFlag.format,
);

export function useEmojiAsImages() { return enabled; }

export const setEmojiAsImages = setEnabled;
