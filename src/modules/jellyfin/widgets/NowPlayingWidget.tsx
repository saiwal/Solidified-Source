// The global sidebar widget mounts on every page for every local user — so it
// imports nothing of the player. Only once Jellyfin is switched on (Settings →
// Integrations) does it load the mini-player, and with it the store, the
// remote/WebSocket code and the party engine. Users who never turn Jellyfin
// on never download any of it.
import { Show, lazy } from "solid-js";
import { isModuleActive } from "@utsukta/spa-core/module-registry";
import { disabledFrontendModules } from "@utsukta/spa-core/store/disabled-frontend-modules";

const MiniPlayer = lazy(() => import("./MiniPlayer"));

export default function NowPlayingWidget() {
  const enabled = () => isModuleActive("jellyfin", new Set(), disabledFrontendModules());
  return (
    <Show when={enabled()}>
      <MiniPlayer />
    </Show>
  );
}
