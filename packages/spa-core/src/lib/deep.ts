// deep() that accepts `undefined` (Solid 2's throws on it) — for effect
// computes that track every field of query data still loading. solid-query 6
// reconciles data in place, so a compute returning the bare object would
// never see a refetch change it; deep() subscribes to all of it and returns a
// plain snapshot.
import { deep } from "solid-js";

export const deepOf = <T>(v: T): T => (v === undefined ? v : deep(v as T & object));
