// The boundary a Solid 2 async read sits in: <Loading> shows `fallback` until
// the data first arrives (a later refetch keeps the content on screen — read
// isPending() for a refresh hint), <Errored> turns a failed load into an
// ErrorState whose retry re-runs the failed reads.
import { Errored, Loading } from "solid-js";
import type { JSX } from "@solidjs/web";
import { useI18n } from "@utsukta/spa-core/i18n";
import { ErrorState } from "@ui/ErrorState";

export default function AsyncBoundary(props: { fallback?: JSX.Element; children: JSX.Element }) {
  const { t } = useI18n();
  return (
    <Errored
      fallback={(err, reset) => (
        <ErrorState
          message={t("ui.load_failed")}
          detail={err() instanceof Error ? (err() as Error).message : undefined}
          retry={reset}
          retryLabel={t("ui.retry")}
        />
      )}
    >
      <Loading fallback={props.fallback}>{props.children}</Loading>
    </Errored>
  );
}
