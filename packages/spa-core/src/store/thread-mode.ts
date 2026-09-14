import { persistedSignal } from "../lib/persisted";

const [threaded, setThreaded] = persistedSignal(
  "hz-thread-mode",
  true,
  (raw) => raw !== "flat",
  (value) => (value ? "threaded" : "flat"),
);

export function useThreadMode() { return threaded; }

export const setThreadMode = setThreaded;
