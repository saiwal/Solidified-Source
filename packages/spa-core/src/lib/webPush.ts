import { apiFetch } from "./fetch";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function fetchVapidPublicKey(): Promise<string> {
  const res = await apiFetch("/spa/push-subscription");
  if (!res.ok) throw new Error("Failed to fetch VAPID public key");
  const { data } = await res.json();
  return data.publicKey as string;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Which step of subscribing failed — each has a different fix for the user/admin. */
export type PushFailure = "unsupported" | "no_worker" | "server_key" | "push_service" | "server_save";

/** Subscribe this browser; resolves null on success, else the failing step. */
export async function trySubscribeToPush(): Promise<PushFailure | null> {
  if (!isPushSupported()) return "unsupported";
  // `ready` never settles when the SW didn't register (blocked, non-HTTPS, sw not deployed).
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 10_000)),
  ]);
  if (!reg) return "no_worker";
  let sub = await reg.pushManager.getSubscription().catch(() => null);
  if (!sub) {
    let publicKey: string;
    try {
      publicKey = await fetchVapidPublicKey();
    } catch {
      return "server_key";
    }
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey) as BufferSource,
      });
    } catch (e) {
      console.warn("[push] subscribe failed:", e);
      return "push_service";
    }
  }
  try {
    const res = await apiFetch("/spa/push-subscription", {
      method: "POST",
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok ? null : "server_save";
  } catch {
    return "server_save";
  }
}

export async function subscribeToPush(): Promise<boolean> {
  return (await trySubscribeToPush()) === null;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await apiFetch("/spa/push-subscription", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    /* best-effort */
  }
}
