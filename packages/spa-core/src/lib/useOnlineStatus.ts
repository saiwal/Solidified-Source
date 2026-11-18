import { createSignal, onSettled } from "solid-js";

export function useOnlineStatus() {
  const [online, setOnline] = createSignal(navigator.onLine);
  onSettled(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
      return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  });
  return online;
}
