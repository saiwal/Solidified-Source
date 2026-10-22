import { Show, For, createSignal } from "solid-js";
import { useQuery, useMutation, useQueryClient } from "@utsukta/spa-core/lib/query";
import { toast } from "@utsukta/spa-core/store/toast";
import SubPageContent from "@/shared/views/SubPageContent";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchLocations, locationAction, type LocationAction } from "../../api/api";
import type { LocationEntry } from "../../store/types";
import {
  MdFillCheck_circle,
  MdOutlineRadio_button_unchecked,
  MdOutlineDelete,
  MdOutlineSync,
} from "solid-icons/md";
import { Button, IconButton } from "@ui/Button";
import { EmptyState } from "@ui/EmptyState";

export default function LocationsSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery(() => ({
    queryKey: ["settings", "locations"] as const,
    queryFn: fetchLocations,
  }));

  const locations = () => query.data ?? [];
  const [confirmDropId, setConfirmDropId] = createSignal<number | null>(null);

  const mutation = useMutation(() => ({
    mutationFn: ({ action, id }: { action: LocationAction; id?: number }) =>
      locationAction(action, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "locations"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Unknown error");
    },
  }));

  const isBusy = (id?: number, action?: LocationAction) =>
    mutation.isPending &&
    mutation.variables?.id === id &&
    (!action || mutation.variables.action === action);

  const run = (action: LocationAction, id?: number) => {
    setConfirmDropId(null);
    mutation.mutate({ action, id });
  };

  const requestDrop = (loc: LocationEntry) => {
    if (confirmDropId() === loc.id) {
      run("drop", loc.id);
    } else {
      setConfirmDropId(loc.id);
    }
  };

  return (
    <SubPageContent
      title={t("settings.title_locations")}
      description={t("settings.desc_locations")}
      action={
        <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => run("sync")}>
          <MdOutlineSync size={14} />
          {isBusy(undefined, "sync") ? t("settings.locations_syncing") : t("settings.locations_sync_now")}
        </Button>
      }
    >
      <Show when={!query.isPending} fallback={<Skeleton />}>
        <Show
          when={locations().length > 0}
          fallback={<EmptyState>{t("settings.locations_empty")}</EmptyState>}
        >
          <div class="divide-y divide-rim">
            <For each={locations()}>
              {(loc) => (
                <div class="flex items-center gap-3 py-3">
                  <button
                    type="button"
                    title={loc.primary ? undefined : t("settings.locations_set_primary")}
                    disabled={loc.primary || !!isBusy(loc.id)}
                    onClick={() => run("set_primary", loc.id)}
                    class={`shrink-0 disabled:cursor-not-allowed ${
                      loc.primary ? "text-accent" : "text-muted hover:text-txt"
                    }`}
                  >
                    <Show when={loc.primary} fallback={<MdOutlineRadio_button_unchecked size={18} />}>
                      <MdFillCheck_circle size={18} />
                    </Show>
                  </button>

                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-txt leading-snug truncate">{loc.addr}</p>
                    <p class="text-xs text-muted truncate">{loc.url}</p>
                  </div>

                  <Show when={!loc.isLocal}>
                    <Show
                      when={confirmDropId() === loc.id}
                      fallback={
                        <IconButton
                          label={t("settings.locations_drop")}
                          variant="danger"
                          size="sm"
                          disabled={!!isBusy(loc.id)}
                          onClick={() => requestDrop(loc)}
                        >
                          <MdOutlineDelete size={16} />
                        </IconButton>
                      }
                    >
                      <div class="shrink-0 flex items-center gap-1.5">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={!!isBusy(loc.id, "drop")}
                          onClick={() => run("drop", loc.id)}
                        >
                          {isBusy(loc.id, "drop") ? t("settings.locations_syncing") : t("settings.locations_drop_confirm")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDropId(null)}>
                          {t("settings.locations_drop_cancel")}
                        </Button>
                      </div>
                    </Show>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </SubPageContent>
  );
}

function Skeleton() {
  return (
    <div class="divide-y divide-rim animate-pulse">
      <For each={[0, 1, 2]}>
        {() => (
          <div class="flex items-center gap-3 py-3">
            <div class="w-[18px] h-[18px] rounded-full bg-elevated shrink-0" />
            <div class="flex-1 space-y-1.5">
              <div class="h-3.5 w-40 rounded bg-elevated" />
              <div class="h-3 w-56 rounded bg-elevated" />
            </div>
            <div class="w-7 h-7 rounded-lg bg-elevated" />
          </div>
        )}
      </For>
    </div>
  );
}
