// The boundary a Solid 2 async read sits in: <Loading> shows `fallback` until
// the data first arrives (a later refetch keeps the content on screen — read
// isPending() for a refresh hint), <Errored> turns a failed load into an
// ErrorState whose retry re-runs the failed reads. `quiet` is for widgets
// that only appear once they have something to show: no message on failure.
// `error` replaces the default ErrorState (a widget's own "unavailable" line).
import { Errored, Loading } from "solid-js";
import type { JSX } from "@solidjs/web";
import { useI18n } from "@utsukta/spa-core/i18n";
import { ErrorState } from "@ui/ErrorState";

export default function AsyncBoundary(props: {
  fallback?: JSX.Element;
  quiet?: boolean;
  error?: JSX.Element | ((err: unknown) => JSX.Element);
  children: JSX.Element;
}) {
  const { t } = useI18n();
  return (
    <Errored
      fallback={(err, reset) => {
        // Caught errors never reach the console otherwise.
        console.error(err());
        const custom = props.error;
        if (custom !== undefined) return typeof custom === "function" ? custom(err()) : custom;
        return props.quiet ? null : (
        <ErrorState
          message={t("ui.load_failed")}
          detail={err() instanceof Error ? (err() as Error).message : undefined}
          retry={reset}
          retryLabel={t("ui.retry")}
        />
      );
      }}
    >
      <Loading fallback={props.fallback}>{props.children}</Loading>
    </Errored>
  );
}
