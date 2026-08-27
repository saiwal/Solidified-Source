import { Show, lazy } from "solid-js";
import { useShareModal } from "@utsukta/spa-core/store/share";

const ShareModal = lazy(() => import("./ShareModal"));

export default function ShareModalHost() {
  const [target, setTarget] = useShareModal();
  const close = () => setTarget(null);

  return (
    <Show when={target()}>
      {(tgt) => <ShareModal target={tgt()} onClose={close} />}
    </Show>
  );
}
