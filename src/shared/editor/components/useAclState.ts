/**
 * useAclState.ts
 * Shared ACL-selection state (mode + allow/deny entry sets) for composers
 * that render an <AclPicker>. Owns interaction state only — each composer
 * still builds its own request payload shape from the accessors here (Post's
 * JSON, Article's dual FormData-create/JSON-edit, Webpage's JSON).
 */

import { createSignal, createEffect } from "solid-js";
import { entryKey, type AclMode, type AclEntry } from "./AclPicker";

export interface AclStateOptions {
  mode?: AclMode;
  allowEntries?: Iterable<string>;
  denyEntries?: Iterable<string>;
  /**
   * Re-derive the initial state when a late-arriving dependency lands, as long
   * as the user hasn't touched the picker yet.
   *
   * Composers can be the initial route, so they build their initial ACL before
   * /spa/nav has answered — and recognising "Only me" needs the viewer's own
   * hash from that response (see aclModeFrom). Without this the mode silently
   * falls back to "custom" on a cold load only.
   */
  resync?: () => AclStateOptions | undefined;
}

export interface AclState {
  mode: () => AclMode;
  setMode: (m: AclMode) => void;
  allowEntries: () => Set<string>;
  denyEntries: () => Set<string>;
  /** Bulk-replace entries — used to restore ACL state from a saved draft. */
  setAllowEntries: (entries: Set<string>) => void;
  setDenyEntries: (entries: Set<string>) => void;
  toggleEntry: (entry: AclEntry, list: "allow" | "deny") => void;
  clearEntries: () => void;
  /** Resets mode to its initial value and clears entries. */
  reset: () => void;
}

export function useAclState(initial?: AclStateOptions): AclState {
  const initialMode = initial?.mode ?? "connections";
  const [mode, setMode] = createSignal<AclMode>(initialMode);
  const [allowEntries, setAllowEntries] = createSignal<Set<string>>(
    new Set<string>(initial?.allowEntries),
  );
  const [denyEntries, setDenyEntries] = createSignal<Set<string>>(
    new Set<string>(initial?.denyEntries),
  );

  // Any user interaction freezes the state against resync.
  const [touched, setTouched] = createSignal(false);

  if (initial?.resync) {
    createEffect(() => {
      const next = initial.resync!();
      if (!next || touched()) return;
      setMode(next.mode ?? initialMode);
      setAllowEntries(new Set<string>(next.allowEntries));
      setDenyEntries(new Set<string>(next.denyEntries));
    });
  }

  function toggleEntry(entry: AclEntry, list: "allow" | "deny") {
    setTouched(true);
    const key = entryKey(entry);
    const setSet = list === "allow" ? setAllowEntries : setDenyEntries;
    const setOther = list === "allow" ? setDenyEntries : setAllowEntries;
    setSet((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setOther((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function clearEntries() {
    setTouched(true);
    setAllowEntries(new Set<string>());
    setDenyEntries(new Set<string>());
  }

  function reset() {
    setMode(initialMode);
    clearEntries();
  }

  return {
    mode,
    setMode: (m: AclMode) => { setTouched(true); setMode(m); },
    allowEntries, denyEntries,
    // Bulk restores (a saved draft) are a deliberate state, so they freeze
    // resync too — otherwise a late nav response would overwrite the draft.
    setAllowEntries: (e: Set<string>) => { setTouched(true); setAllowEntries(e); },
    setDenyEntries:  (e: Set<string>) => { setTouched(true); setDenyEntries(e); },
    toggleEntry, clearEntries, reset,
  };
}

/** Splits "{type}:{xid}" keys into contact/group id arrays for building a request payload. */
export function splitAclEntries(entries: Set<string>): {
  contactIds: string[];
  groupIds: string[];
} {
  const contactIds: string[] = [];
  const groupIds: string[] = [];
  for (const key of entries) {
    const [type, ...rest] = key.split(":");
    const xid = rest.join(":");
    if (type === "c") contactIds.push(xid);
    if (type === "g") groupIds.push(xid);
  }
  return { contactIds, groupIds };
}
