import { For, Show } from "solid-js";
import { useNavigate, useLocation } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { getAllTours, startTour } from "@utsukta/spa-core/lib/tours";
import { Button } from "@ui/Button";
import { Card } from "@ui/Card";

export default function HelpToursWidget() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const tours = getAllTours();

  function handleStart(id: string, path?: string) {
    const labels = { back: t("tour.back"), next: t("tour.next"), done: t("tour.done") };
    // startTour() waits for the route's (lazily loaded) widgets itself.
    if (path && location.pathname !== path) navigate(path);
    void startTour(id, t, labels);
  }

  return (
    <Show when={tours.length > 0}>
      <Card raised class="overflow-hidden">
        <div class="px-4 pt-3.5 pb-3">
          <h3 class="text-sm font-semibold text-txt">{t("tour.guided_tours")}</h3>
          <p class="text-xs text-muted mt-0.5">{t("tour.guided_tours_desc")}</p>
        </div>
        <ul class="px-3 pb-3.5 space-y-1.5">
          <For each={tours}>
            {(tour) => (
              <li class="flex items-center justify-between gap-2 px-1.5 py-1.5 rounded-lg hover:bg-elevated transition-colors">
                <div class="min-w-0">
                  <p class="text-xs font-medium text-txt truncate">{tour.label(t)}</p>
                  <Show when={tour.description}>
                    <p class="text-[0.7rem] text-muted truncate">{tour.description!(t)}</p>
                  </Show>
                </div>
                <Button size="sm" class="shrink-0" onClick={() => handleStart(tour.id, tour.path)}>
                  {t("tour.start_tour")}
                </Button>
              </li>
            )}
          </For>
        </ul>
      </Card>
    </Show>
  );
}
