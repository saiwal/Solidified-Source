import { get, set, del, keys } from "idb-keyval";
import { snapshot } from "solid-js";

export const storageGet = <T>(key: string, fallback: T): Promise<T> =>
  get<T>(key).then((v) => (v !== undefined ? v : fallback));

// unwrap: query/store data is a Solid proxy, which IndexedDB's structured
// clone rejects ("Proxy object could not be cloned"). No-op for plain values.
export const storageSet = <T>(key: string, value: T): Promise<void> =>
  set(key, snapshot(value));

export const storageDel = (key: string): Promise<void> => del(key);

export const storageKeys = (): Promise<string[]> =>
  keys().then((ks) => ks.filter((k): k is string => typeof k === "string"));
