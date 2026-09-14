import { persistedSignal, oneOf } from "../lib/persisted";

export type ListBehavior = "list" | "inbox";

const [listBehavior, setBehavior] = persistedSignal<ListBehavior>(
  "hz-list-behavior",
  "list",
  oneOf<ListBehavior>("list", "inbox"),
);

export function useListBehavior() { return listBehavior; }

export const setListBehavior = setBehavior;
