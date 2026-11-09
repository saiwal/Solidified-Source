// Self-verification by emoji (SAS) with another of your sessions, started from
// here or from the other device. QR is not offered: we never advertise it, so
// Element falls back to emoji.
import { For, Match, Show, Switch, createSignal, onCleanup } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  VerificationPhase, VerificationRequestEvent, VerifierEvent,
  type ShowSasCallbacks, type VerificationRequest, type Verifier,
} from "matrix-js-sdk/lib/crypto-api/index.js";
import { Button } from "@ui/Button";
import { Modal, ModalPanel } from "@ui/Modal";
import { Spinner } from "@ui/Spinner";
import { MdOutlineCheck_circle } from "solid-icons/md";
import { endVerification } from "./client";

export default function Verification(props: { request: VerificationRequest }) {
  const { t } = useI18n();
  const req = props.request;
  const [phase, setPhase] = createSignal(req.phase);
  const [sas, setSas] = createSignal<ShowSasCallbacks | null>(null);
  const [error, setError] = createSignal("");
  const [confirmed, setConfirmed] = createSignal(false);
  const [starting, setStarting] = createSignal(false);

  // Drive the verifier once one exists, whichever side started it.
  let driven: Verifier | undefined;
  function drive() {
    const v = req.verifier;
    if (!v || v === driven) return;
    driven = v;
    v.on(VerifierEvent.ShowSas, setSas);
    const shown = v.getShowSasCallbacks();
    if (shown) setSas(shown);
    v.verify().catch((e: Error) => { if (!req.declining) setError(e.message); });
  }
  const onChange = () => { setPhase(req.phase); drive(); };
  req.on(VerificationRequestEvent.Change, onChange);
  drive();
  onCleanup(() => req.off(VerificationRequestEvent.Change, onChange));

  const finished = () => phase() === VerificationPhase.Done || phase() === VerificationPhase.Cancelled;
  function close() {
    if (!finished()) void req.cancel().catch(() => {});
    endVerification();
  }
  async function compare() {
    setStarting(true);
    try { await req.startVerification("m.sas.v1"); drive(); }
    catch (e) { setError((e as Error).message); }
    finally { setStarting(false); }
  }

  const waiting = <div class="flex items-center gap-2 text-sm text-muted"><Spinner size="sm" />{t("matrix.verify_wait_other")}</div>;

  return (
    <Modal onClose={close} dismissOnBackdrop={false}>
      <ModalPanel size="md" title={t("matrix.verify_title")} onClose={close}>
        <div class="p-4 flex flex-col gap-4">
          <Show when={error()}>
            <p class="text-sm text-danger-txt">{t("matrix.verify_failed", { error: error() })}</p>
          </Show>
          <Switch>
            <Match when={phase() === VerificationPhase.Done}>
              <p class="flex items-center gap-2 text-sm text-success-txt">
                <MdOutlineCheck_circle size={20} />{t("matrix.verify_done")}
              </p>
            </Match>
            <Match when={phase() === VerificationPhase.Cancelled}>
              <p class="text-sm text-muted">{t("matrix.verify_cancelled")}</p>
            </Match>
            <Match when={sas()}>
              <p class="text-sm text-txt">{t("matrix.verify_compare")}</p>
              <div class="grid grid-cols-4 sm:grid-cols-7 gap-2">
                <For each={sas()!.sas.emoji ?? []}>
                  {([emoji, name]) => (
                    <div class="flex flex-col items-center gap-1 text-center">
                      <span class="text-3xl" aria-hidden="true">{emoji}</span>
                      <span class="text-[0.6875rem] text-muted leading-tight">{name}</span>
                    </div>
                  )}
                </For>
              </div>
              <Show
                when={!confirmed()}
                fallback={waiting}
              >
                <div class="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" onClick={() => sas()!.mismatch()}>{t("matrix.verify_mismatch")}</Button>
                  <Button onClick={() => { setConfirmed(true); void sas()!.confirm().catch((e: Error) => setError(e.message)); }}>
                    {t("matrix.verify_match")}
                  </Button>
                </div>
              </Show>
            </Match>
            <Match when={phase() === VerificationPhase.Requested && !req.initiatedByMe}>
              <p class="text-sm text-txt">{t("matrix.verify_incoming")}</p>
              <div class="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={close}>{t("matrix.decline")}</Button>
                <Button onClick={() => void req.accept().catch((e: Error) => setError(e.message))}>{t("matrix.accept")}</Button>
              </div>
            </Match>
            <Match when={phase() === VerificationPhase.Requested || phase() === VerificationPhase.Unsent}>
              <p class="text-sm text-txt">{t("matrix.verify_waiting")}</p>
              {waiting}
            </Match>
            <Match when={phase() === VerificationPhase.Ready}>
              <p class="text-sm text-txt">{t("matrix.verify_ready")}</p>
              <div class="flex justify-end">
                <Button onClick={() => void compare()} disabled={starting()}>
                  {starting() ? <Spinner size="sm" /> : t("matrix.verify_compare_start")}
                </Button>
              </div>
            </Match>
            <Match when={phase() === VerificationPhase.Started}>{waiting}</Match>
          </Switch>
          <Show when={finished()}>
            <div class="flex justify-end">
              <Button onClick={close}>{t("matrix.close")}</Button>
            </div>
          </Show>
        </div>
      </ModalPanel>
    </Modal>
  );
}
