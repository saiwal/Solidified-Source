// modules/manage/store.ts

import { createSignal } from "solid-js";
import { createResource } from "@utsukta/spa-core/lib/resource";
import { toast } from "@utsukta/spa-core/store/toast";
import {
  fetchManageApi,
  switchChannel as apiSwitch,
  setDefaultChannel as apiSetDefault,
  type ManageApiResponse,
} from "./api";

// ── Resource ──────────────────────────────────────────────────────────────────

// refetch trigger — increment to force a reload
const [manageVersion, setManageVersion] = createSignal(0);

const [manageData] = createResource<ManageApiResponse, number>(
  manageVersion,
  (_version) => fetchManageApi(),
);
export function useManageData() {
  return manageData;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type ActionState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string };

const [actionState, setActionState] = createSignal<ActionState>({
  status: "idle",
});

export function useActionState() {
  return actionState;
}

export async function doSwitchChannel(
  channelId: number,
): Promise<string | null> {
  setActionState({ status: "pending" });
  try {
    const result = await apiSwitch(channelId);
    setActionState({ status: "idle" });
    return result.redirect_to;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Switch failed";
    toast.error(msg);
    setActionState({ status: "error", message: msg });
    return null;
  }
}

export async function doSetDefault(channelId: number): Promise<boolean> {
  setActionState({ status: "pending" });
  try {
    await apiSetDefault(channelId);
    setActionState({ status: "idle" });
    // Optimistically refresh so is_default flags update
    setManageVersion((v) => v + 1);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Set default failed";
    toast.error(msg);
    setActionState({ status: "error", message: msg });
    return false;
  }
}
