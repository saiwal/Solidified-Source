// The stored Matrix login — no SDK import, so the chat button can ask
// "is there a session?" from any page without loading matrix-js-sdk.
// Keyed by hub channel so switching channels never mixes accounts. The access
// token never leaves this browser (the hub stores nothing). It sits in
// localStorage, which XSS could read, but so could it read the SDK's
// IndexedDB stores beside it.
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { frontendFeatureEnabled, getModule } from "@utsukta/spa-core/module-registry";
import { disabledFrontendModules } from "@utsukta/spa-core/store/disabled-frontend-modules";

export interface MatrixSession {
  uid: number;
  baseUrl: string;
  userId: string;
  deviceId: string;
  accessToken: string;
}

const key = (uid: number) => `hz-matrix:${uid}`;
const currentUid = () => useAuth()()?.uid ?? 0;

export function loadSession(): MatrixSession | null {
  const uid = currentUid();
  if (!uid) return null;
  try {
    const s = JSON.parse(localStorage.getItem(key(uid)) ?? "null");
    return s?.accessToken ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: MatrixSession): void {
  try { localStorage.setItem(key(s.uid), JSON.stringify(s)); } catch { /* private mode: session lasts this tab */ }
}

export function clearSession(uid: number): void {
  try { localStorage.removeItem(key(uid)); } catch { /* nothing stored */ }
}

export const hasMatrixSession = () => !!loadSession();
export { currentUid };

/** Database prefix for the SDK's sync + crypto stores. */
export const dbPrefix = (s: MatrixSession) => `hz-matrix-${s.uid}-${s.userId}`;

/** The Matrix app (modules/matrix) is switched on for this user — Settings → Integrations. */
export const matrixEnabled = () =>
  !!getModule("matrix") && frontendFeatureEnabled(getModule("matrix")!.frontendFeature, "matrix", disabledFrontendModules());
