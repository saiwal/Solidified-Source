import { Show } from "solid-js";
import SubPageContent from "@/shared/views/SubPageContent";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { useSectionForm } from "../../store/useSectionForm";
import { SaveBar } from "../../store/FormHelpers";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Field, Input, Textarea } from "@ui/Field";

interface ProfileData {
  name: string;
  pdesc: string;
  homepage: string;
  hometown: string;
  gender: string;
  birthday: string;
  about: string;
  keywords: string;
  hide_friends: number;
  publish: number;
}

async function fetchProfile(): Promise<ProfileData> {
  const res = await apiFetch("/spa/settings/profile");
  const { data } = await res.json();
  return data;
}

async function saveProfile(payload: Partial<ProfileData>): Promise<void> {
  const res = await apiFetch("/spa/settings/profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error?.message ?? "Save failed");
  }
  // Same stale-read as the multi-profile editor: /spa/profile/:nick is cached
  // under keys this form never touches.
  queryClient.invalidateQueries({
    predicate: (q) => ["channel-profile", "contact-card"].includes(q.queryKey[0] as string),
  });
}

export default function ProfileSection() {
  const { t } = useI18n();
  const { data, saving, handleSubmit } = useSectionForm({
    section: "profile",
    fetcher: fetchProfile,
    saver: saveProfile,
    numericFields: ["hide_friends", "publish"],
    checkboxFields: ["hide_friends", "publish"],
  });

  return (
    <SubPageContent title={t("settings.title_profile")} description={t("settings.desc_profile")}>
      <Show when={data()} fallback={<Skeleton />}>
        <form onSubmit={handleSubmit} class="space-y-5">

          <Field label={t("settings.display_name")}>
            <Input class="w-full" type="text" name="name" value={data()!.name} />
          </Field>

          <Field label={t("settings.short_description")}>
            <Input
              class="w-full"
              type="text"
              name="pdesc"
              value={data()!.pdesc}
              placeholder={t("settings.short_description_placeholder")}
            />
          </Field>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("settings.hometown")}>
              <Input class="w-full" type="text" name="hometown" value={data()!.hometown} />
            </Field>
            <Field label={t("settings.gender")}>
              <Input class="w-full" type="text" name="gender" value={data()!.gender} />
            </Field>
            <Field label={t("settings.birthday")} hint={t("settings.birthday_hint")}>
              <Input class="w-full" type="text" name="birthday" value={data()!.birthday} />
            </Field>
            <Field label={t("settings.homepage")}>
              <Input class="w-full" type="url" name="homepage" value={data()!.homepage} />
            </Field>
          </div>

          <Field label={t("settings.about")} hint={t("settings.about_hint")}>
            <Textarea class="w-full resize-y" name="about" rows="4">
              {data()!.about}
            </Textarea>
          </Field>

          <Field label={t("settings.keywords")} hint={t("settings.keywords_hint")}>
            <Input class="w-full" type="text" name="keywords" value={data()!.keywords} />
          </Field>

          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="hide_friends"
              value="1"
              checked={!!data()!.hide_friends}
              class="h-4 w-4 rounded border-rim accent-accent"
            />
            <span class="text-sm text-txt">{t("settings.hide_friends")}</span>
          </label>

          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="publish"
              value="1"
              checked={!!data()!.publish}
              class="h-4 w-4 rounded border-rim accent-accent"
            />
            <span class="text-sm text-txt">{t("settings.publish_in_directory")}</span>
          </label>

          <SaveBar saving={saving()} />
        </form>

      </Show>
    </SubPageContent>
  );
}


function Skeleton() {
  return (
    <div class="space-y-5 animate-pulse">
      {[...Array(5)].map(() => (
        <div class="space-y-1.5">
          <div class="h-3.5 w-28 rounded bg-elevated" />
          <div class="h-9 w-full rounded-lg bg-elevated" />
        </div>
      ))}
    </div>
  );
}
