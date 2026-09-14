import { persistedSignal, boolFlag } from "../lib/persisted";

const [enabled, setEnabled] = persistedSignal(
  "hz-emoji-as-images",
  false,
  boolFlag.parse,
  boolFlag.format,
);

export function useEmojiAsImages() { return enabled; }

export const setEmojiAsImages = setEnabled;
