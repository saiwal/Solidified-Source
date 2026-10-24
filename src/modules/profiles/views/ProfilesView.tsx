import { createSignal, Show, For } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import {
  fetchProfiles,
  createProfile,
  deleteProfile,
  type ProfileListItem,
} from "../api/api";
import SubPageLayout from "@/shared/views/SubPageLayout";
import { SETTINGS_ITEMS } from "@/modules/settings/index";
import PageActions from "@/shared/views/layout/PageActions";
import { MdOutlineAdd } from "solid-icons/md";
import { Button } from "@ui/Button";
import { Card } from "@ui/Card";
import { Badge } from "@ui/Badge";
import { Switch } from "@ui/Toggle";

export default function ProfilesView() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [result, { refetch }] = createQueryResource("profiles", fetchProfiles);
  const [creating, setCreating] = createSignal(false);
  const [togglingFeature, setTogglingFeature] = createSignal(false);

  async function handleCreate() {
    setCreating(true);
    try {
      const id = await createProfile(t("profiles.new_profile_name"));
      navigate(`/settings/profile/${id}`);
    } catch {
      toast.error(t("profiles.create_error"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("profiles.delete_confirm"))) return;
    try {
      await deleteProfile(id);
      toast.success(t("profiles.deleted"));
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profiles.delete_error"));
    }
  }

  async function toggleMultiProfiles(currentlyEnabled: boolean) {
    setTogglingFeature(true);
    try {
      const res = await apiFetch("/spa/settings/features", {
        method: "POST",
        body: JSON.stringify({ feature: "multi_profiles", enabled: currentlyEnabled ? 0 : 1 }),
      });
      if (!res.ok) throw new Error("Failed");
      refetch();
    } catch {
      toast.error(t("profiles.toggle_error"));
    } finally {
      setTogglingFeature(false);
    }
  }

  const multiEnabled = () => result()?.multiProfilesEnabled ?? false;

  return (
    <SubPageLayout base="/settings" items={SETTINGS_ITEMS} activeKey="profile">
    <div class="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-0.5">
          <h2 class="text-base font-semibold text-txt">{t("profiles.title")}</h2>
          <p class="text-sm text-muted">{t("profiles.desc")}</p>
        </div>
        <PageActions class="shrink-0" label={t("profiles.title")} actions={[{
          label: creating() ? t("profiles.creating") : t("profiles.new_profile"),
          icon: MdOutlineAdd,
          onClick: handleCreate,
          disabled: creating(),
          primary: true,
          show: multiEnabled(),
        }]} />
      </div>

      <hr class="border-rim" />

      <Show when={result.loading}>
        <Skeleton />
      </Show>

      <Show when={result.error}>
        <p class="text-sm text-muted">{t("profiles.load_error")}</p>
      </Show>

      <Show when={result()}>
        <div class="space-y-3">
          <For each={result()!.profiles}>
            {(profile) => (
              <ProfileCard
                profile={profile}
                multiEnabled={multiEnabled()}
                onDelete={() => handleDelete(profile.id)}
              />
            )}
          </For>
          <Show when={(result()?.profiles.length ?? 0) === 0}>
            <p class="text-sm text-muted">{t("profiles.no_profiles")}</p>
          </Show>
        </div>

        {/* Multiple profiles toggle */}
        <Card class="flex items-start gap-4 px-4 py-3 mt-2">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-txt">{t("profiles.feature_title")}</p>
            <p class="text-xs text-muted mt-0.5 leading-relaxed">{t("profiles.feature_desc")}</p>
          </div>
          <Switch
            class="mt-0.5"
            checked={multiEnabled()}
            disabled={togglingFeature()}
            label={multiEnabled() ? t("settings.feat_toggle_off") : t("settings.feat_toggle_on")}
            onChange={() => void toggleMultiProfiles(multiEnabled())}
          />
        </Card>
      </Show>
    </div>
    </SubPageLayout>
  );
}

function ProfileCard(props: {
  profile: ProfileListItem;
  multiEnabled: boolean;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const p = props.profile;

  return (
    <Card class="flex items-center gap-4 px-4 py-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-txt truncate">{p.profile_name}</span>
          <Show when={p.is_default}>
            <Badge tone="accent" class="shrink-0">
              {t("profiles.default_badge")}
            </Badge>
          </Show>
        </div>
        <Show when={p.pdesc}>
          <p class="text-xs text-muted truncate mt-0.5">{p.pdesc}</p>
        </Show>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <A
          href={`/settings/profile/${p.id}`}
          class="px-3 py-1.5 text-xs font-medium rounded-lg border border-rim
                 text-txt hover:bg-elevated transition-colors"
        >
          {t("profiles.edit")}
        </A>
        <Show when={props.multiEnabled && !p.is_default}>
          <Button variant="ghost" size="sm" onClick={props.onDelete}>
            {t("profiles.delete")}
          </Button>
        </Show>
      </div>
    </Card>
  );
}

function Skeleton() {
  return (
    <div class="space-y-3 animate-pulse">
      {[...Array(2)].map(() => (
        <Card class="px-4 py-3 flex items-center gap-4">
          <div class="flex-1 space-y-1.5">
            <div class="h-4 w-32 rounded bg-elevated" />
            <div class="h-3 w-48 rounded bg-elevated" />
          </div>
          <div class="h-7 w-14 rounded-lg bg-elevated" />
        </Card>
      ))}
    </div>
  );
}
