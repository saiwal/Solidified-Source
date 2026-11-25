import { createSignal, onSettled } from "solid-js";
import { hubReachable, REACHABILITY_EVENT } from "./offline-fallback";

// "Online" = the device has a link *and* the hub answered the last /spa/
// request (see the reachability notes in offline-fallback.ts).
export function useOnlineStatus() {
  const [device, setDevice] = createSignal(navigator.onLine);
  const [hub, setHub] = createSignal(hubReachable());
  onSettled(() => {
    const on  = () => setDevice(true);
    const off = () => setDevice(false);
    const reach = (e: Event) => setHub((e as CustomEvent<boolean>).detail);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    window.addEventListener(REACHABILITY_EVENT, reach);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
      window.removeEventListener(REACHABILITY_EVENT, reach);
    };
  });
  return () => device() && hub();
}
