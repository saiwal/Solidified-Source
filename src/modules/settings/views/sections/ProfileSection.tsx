import { Show } from "solid-js";
import SubPageContent from "@/shared/views/SubPageContent";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { useSectionForm } from "../../store/useSectionForm";
import { SaveBar } from "../../store/FormHelpers";
import { useI18n } from "@utsukta/spa-core/i18n";

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
            <input type="text" name="name" value={data()!.name}
              class={input} />
          </Field>

          <Field label={t("settings.short_description")}>
            <input type="text" name="pdesc" value={data()!.pdesc}
              placeholder={t("settings.short_description_placeholder")}
              class={input} />
          </Field>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("settings.hometown")}>
              <input type="text" name="hometown" value={data()!.hometown} class={input} />
            </Field>
            <Field label={t("settings.gender")}>
              <input type="text" name="gender" value={data()!.gender} class={input} />
            </Field>
            <Field label={t("settings.birthday")} hint={t("settings.birthday_hint")}>
              <input type="text" name="birthday" value={data()!.birthday} class={input} />
            </Field>
            <Field label={t("settings.homepage")}>
              <input type="url" name="homepage" value={data()!.homepage} class={input} />
            </Field>
          </div>

          <Field label={t("settings.about")} hint={t("settings.about_hint")}>
            <textarea
              name="about"
              rows="4"
              class={`${input} resize-y`}
            >
              {data()!.about}
            </textarea>
          </Field>

          <Field label={t("settings.keywords")} hint={t("settings.keywords_hint")}>
            <input type="text" name="keywords" value={data()!.keywords} class={input} />
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

const input = `w-full px-3 py-2 rounded-lg border border-rim bg-surface text-txt text-sm
  placeholder:text-muted hover:border-rim-strong focus:outline-none
  focus:border-rim-strong transition-colors`;

function Field(props: { label: string; hint?: string; children: any }) {
  return (
    <div class="space-y-1.5">
      <label class="block text-sm font-medium text-txt">{props.label}</label>
      {props.children}
      <Show when={props.hint}>
        <p class="text-xs text-muted">{props.hint}</p>
      </Show>
    </div>
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
