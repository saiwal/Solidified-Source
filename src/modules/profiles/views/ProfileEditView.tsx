import { createResource, createSignal, lazy, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useParams, A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { fetchProfile, saveProfile, uploadPhoto } from "../api/api";
import { fetchPhotoImage, type Photo } from "@/modules/photos/api/api";
import { Section, Toggle, inputClass } from "@/modules/settings/store/FormHelpers";
import PhotosPicker from "@/shared/editor/attachments/picker/PhotosPicker";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import RichEditor from "@/shared/editor/core/RichEditor";
import SourceToggleButton from "@/shared/editor/components/SourceToggleButton";
import { CAPABILITIES } from "@/shared/editor/types/editor.types";
import type { EditorTab } from "@/shared/editor/types/editor.types";
import { isAnimatedImage } from "@utsukta/spa-core/lib/isAnimatedImage";

// Lazy-loaded so Filerobot + React don't inflate the profile chunk
const ImageEditor = lazy(() => import("@/shared/views/ImageEditor"));

// <input type="date"> can't represent year "0000" (Hubzilla's "year not
// disclosed" convention), so a placeholder year keeps the picker populated;
// the real "0000" is swapped back in on submit when dob_hide_year is checked.
const DOB_PLACEHOLDER_YEAR = "2000";

function dobDateValue(dob: string | undefined): string {
  const m = (dob ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, year, month, day] = m;
  if (month === "00" || day === "00") return "";
  return `${year === "0000" ? DOB_PLACEHOLDER_YEAR : year}-${month}-${day}`;
}

function dobYearHidden(dob: string | undefined): boolean {
  return /^0000-\d{2}-\d{2}/.test(dob ?? "");
}

export default function ProfileEditView() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const [saving, setSaving] = createSignal(false);

  // Photo editor state
  const [avatarFile, setAvatarFile] = createSignal<File | null>(null);
  const [coverFile, setCoverFile] = createSignal<File | null>(null);
  const [avatarUrl, setAvatarUrl] = createSignal<string | null>(null);
  const [coverUrl, setCoverUrl] = createSignal<string | null>(null);
  const [avatarUploading, setAvatarUploading] = createSignal(false);
  const [coverUploading, setCoverUploading] = createSignal(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = createSignal(false);
  const [coverPickerOpen, setCoverPickerOpen] = createSignal(false);

  // "About" gets the full BBCode editor (source/WYSIWYG + toolbar), mirroring
  // core's advanced_profile()/prepare_text() BBCode rendering for this field —
  // kept out of native <form> FormData since RichEditor isn't a form control.
  const [aboutBody, setAboutBody] = createSignal("");
  const [aboutTab, setAboutTab] = createSignal<EditorTab>("source");

  const [profile] = createResource(() => params.id, async (id) => {
    const data = await fetchProfile(id);
    // Seed URL signals from initial profile data (bust cache on first load)
    if (data.avatar_l) setAvatarUrl(data.avatar_l + "?t=" + Date.now());
    if (data.cover_url) setCoverUrl(data.cover_url);
    setAboutBody(data.about ?? "");
    return data;
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const raw: Record<string, string | number> = Object.fromEntries(fd) as Record<string, string>;
    raw.about = aboutBody();
    raw.hide_friends = "hide_friends" in raw ? 1 : 0;
    raw.publish = "publish" in raw ? 1 : 0;

    // dob_date carries a real (placeholder, if year is hidden) year so
    // <input type="date"> — which can't represent year 0000 — stays populated;
    // swap in "0000" here so month/day-only birthdays save correctly.
    const dobDate = raw.dob_date as string | undefined;
    if (dobDate) {
      const [, month, day] = dobDate.split("-");
      raw.dob = `${"dob_hide_year" in raw ? "0000" : dobDate.slice(0, 4)}-${month}-${day}`;
    } else {
      raw.dob = "0000-00-00";
    }
    delete raw.dob_date;
    delete raw.dob_hide_year;

    setSaving(true);
    try {
      await saveProfile(params.id, raw);
      toast.success(t("profiles.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profiles.save_error"));
    } finally {
      setSaving(false);
    }
  }

  function pickFile(type: "avatar" | "cover") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      // Animated GIF/WEBP avatars skip the crop editor: its canvas-based
      // save step flattens animation to a single JPEG frame.
      if (type === "avatar" && (await isAnimatedImage(file))) {
        handleAvatarConfirm(file);
        return;
      }
      if (type === "avatar") setAvatarFile(file);
      else setCoverFile(file);
    };
    input.click();
  }

  async function handleAvatarConfirm(blob: Blob) {
    setAvatarFile(null);
    setAvatarUploading(true);
    try {
      const res = await uploadPhoto("avatar", blob);
      if (res.avatar_l) setAvatarUrl(res.avatar_l);
      toast.success(t("profiles.avatar_saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profiles.avatar_error"));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handlePhotoFromLibrary(type: "avatar" | "cover", photo: Photo) {
    if (type === "avatar") setAvatarPickerOpen(false);
    else setCoverPickerOpen(false);
    try {
      // photo.src from the picker's grid listing is a 320px thumbnail;
      // fetch the detail record for the original-resolution src_full.
      const detail = await fetchPhotoImage(currentNick() ?? "", photo.resource_id);
      const res = await fetch(detail.src_full || photo.src, { credentials: "include" });
      const blob = await res.blob();
      const file = new File([blob], photo.filename || "photo.jpg", { type: blob.type || "image/jpeg" });
      if (type === "avatar") setAvatarFile(file);
      else setCoverFile(file);
    } catch {
      toast.error(t("profiles.photo_fetch_error"));
    }
  }

  async function handleCoverConfirm(blob: Blob) {
    setCoverFile(null);
    setCoverUploading(true);
    try {
      const res = await uploadPhoto("cover", blob);
      if (res.cover_url) setCoverUrl(res.cover_url);
      toast.success(t("profiles.cover_saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profiles.cover_error"));
    } finally {
      setCoverUploading(false);
    }
  }

  return (
    <div class="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {/* Back link */}
      <div class="flex items-center gap-3">
        <A
          href="/settings/profile"
          class="text-sm text-muted hover:text-txt transition-colors flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t("profiles.back")}
        </A>
      </div>

      <div class="space-y-0.5">
        <h2 class="text-base font-semibold text-txt">{t("profiles.edit_title")}</h2>
        <Show when={profile()}>
          <p class="text-sm text-muted">{profile()!.profile_name}</p>
        </Show>
      </div>

      <hr class="border-rim" />

      {/* Filerobot image editors — render their own full-screen overlay */}
      <Show when={avatarFile()}>
        {(file) => (
          <ImageEditor
            file={file()}
            aspect={1}
            circular={true}
            onConfirm={handleAvatarConfirm}
            onCancel={() => setAvatarFile(null)}
          />
        )}
      </Show>

      <Show when={coverFile()}>
        {(file) => (
          <ImageEditor
            file={file()}
            aspect={1200 / 435}
            circular={false}
            onConfirm={handleCoverConfirm}
            onCancel={() => setCoverFile(null)}
          />
        )}
      </Show>

      <Show when={avatarPickerOpen()}>
        <ProfilePhotoPickerModal
          nick={currentNick()}
          onSelect={(photo) => handlePhotoFromLibrary("avatar", photo)}
          onClose={() => setAvatarPickerOpen(false)}
        />
      </Show>

      <Show when={coverPickerOpen()}>
        <ProfilePhotoPickerModal
          nick={currentNick()}
          onSelect={(photo) => handlePhotoFromLibrary("cover", photo)}
          onClose={() => setCoverPickerOpen(false)}
        />
      </Show>

      {/* Loading skeleton */}
      <Show when={profile.loading}>
        <FormSkeleton />
      </Show>

      {/* Error */}
      <Show when={profile.error}>
        <p class="text-sm text-muted">{t("profiles.load_error")}</p>
      </Show>

      {/* Form */}
      <Show when={profile()}>
        {(p) => (
          <form onSubmit={handleSubmit} class="space-y-8">

            {/* Cover + avatar header — same card geometry as the
                channel.details widget (channel/views/ProfileView.tsx) */}
            <div class="rounded-2xl overflow-hidden bg-surface border border-rim shadow-sm">
              {/* Cover photo */}
              <div
                class="relative w-full bg-elevated group/cover"
                style="aspect-ratio: 3 / 1"
              >
                <Show when={coverUrl()}>
                  {(url) => (
                    <img
                      src={url()}
                      alt=""
                      class="w-full h-full object-cover"
                    />
                  )}
                </Show>
                <Show when={!coverUrl() && !p().cover_url}>
                  <div class="w-full h-full bg-gradient-to-br from-accent to-accent-txt" />
                </Show>

                {/* Cover photo buttons */}
                <div class="absolute inset-0 flex items-center justify-center gap-2 opacity-100 md:opacity-0 md:group-hover/cover:opacity-100 transition-opacity bg-black/30">
                  <Show when={coverUploading()} fallback={
                    <>
                      <button
                        type="button"
                        onClick={() => pickFile("cover")}
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-sm hover:bg-black/80 transition-colors"
                      >
                        <UploadIcon class="w-4 h-4" />
                        {t("profiles.upload_photo")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCoverPickerOpen(true)}
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-sm hover:bg-black/80 transition-colors"
                      >
                        <GalleryIcon class="w-4 h-4" />
                        {t("profiles.choose_from_library")}
                      </button>
                    </>
                  }>
                    <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 text-white text-sm">
                      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t("profiles.uploading")}
                    </div>
                  </Show>
                </div>

                {/* Avatar, overlapping the cover's bottom edge */}
                <div class="absolute -bottom-10 left-5 z-10 group/avatar">
                  <div class="w-20 h-20 rounded-full ring-4 ring-surface overflow-hidden bg-overlay">
                    <Show when={avatarUrl() || p().avatar_l}>
                      {(url) => (
                        <img
                          src={url()}
                          alt=""
                          class="w-full h-full object-cover"
                        />
                      )}
                    </Show>
                  </div>
                  {/* Avatar overlay */}
                  <div class="absolute inset-0 rounded-full flex items-center justify-center gap-1.5
                              opacity-100 md:opacity-0 md:group-hover/avatar:opacity-100 transition-opacity bg-black/50">
                    <Show when={avatarUploading()} fallback={
                      <>
                        <button
                          type="button"
                          onClick={() => pickFile("avatar")}
                          class="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                          aria-label={t("profiles.upload_photo")}
                        >
                          <CameraIcon class="w-4 h-4 text-white" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAvatarPickerOpen(true)}
                          class="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                          aria-label={t("profiles.choose_from_library")}
                        >
                          <GalleryIcon class="w-4 h-4 text-white" />
                        </button>
                      </>
                    }>
                      <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </Show>
                  </div>
                </div>
              </div>

              {/* Name row — pt-12 clears the overlapping avatar */}
              <div class="pt-12 px-5 pb-5">
                <h1 class="text-lg font-bold leading-tight text-txt">{p().fullname || p().profile_name}</h1>
                <Show when={p().pdesc}>
                  <p class="text-xs text-muted mt-0.5 italic">{p().pdesc}</p>
                </Show>
              </div>
            </div>

            {/* Profile identity */}
            <Section title={t("profiles.group_basic")}>
              <Field label={t("profiles.profile_name_label")} hint={t("profiles.profile_name_hint")}>
                <input type="text" name="profile_name" value={p().profile_name ?? ""} class={inputClass} />
              </Field>
              <Field label={t("profiles.fullname")}>
                <input type="text" name="fullname" value={p().fullname ?? ""} class={inputClass} />
              </Field>
              <Field label={t("profiles.pdesc")}>
                <input type="text" name="pdesc" value={p().pdesc ?? ""}
                  placeholder={t("profiles.pdesc_placeholder")} class={inputClass} />
              </Field>
              <Field label={t("profiles.about")} hint={t("profiles.about_hint")}>
                <RichEditor
                  body={aboutBody()}
                  onInput={setAboutBody}
                  capabilities={CAPABILITIES.wiki}
                  tab={aboutTab()}
                  onTabChange={setAboutTab}
                  mimetype="text/bbcode"
                  placeholder={t("profiles.about_hint")}
                  minHeight="140px"
                />
                <div class="flex justify-end mt-1.5">
                  <SourceToggleButton
                    tab={aboutTab()}
                    onToggle={() => setAboutTab(aboutTab() === "wysiwyg" ? "source" : "wysiwyg")}
                  />
                </div>
              </Field>
              <Field label={t("profiles.keywords")} hint={t("profiles.keywords_hint")}>
                <input type="text" name="keywords" value={p().keywords ?? ""} class={inputClass} />
              </Field>
              <Toggle
                name="hide_friends"
                label={t("profiles.hide_friends")}
                checked={!!p().hide_friends}
              />
              <Show when={p().is_default}>
                <Toggle
                  name="publish"
                  label={t("profiles.publish_in_directory")}
                  checked={!!p().publish}
                />
              </Show>
            </Section>

            {/* Personal */}
            <Section title={t("profiles.group_personal")}>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t("profiles.gender")}>
                  <input type="text" name="gender" value={p().gender ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.dob")} hint={t("profiles.dob_hint")}>
                  <input type="date" name="dob_date" value={dobDateValue(p().dob)} class={inputClass} />
                  <label class="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      name="dob_hide_year"
                      value="1"
                      checked={dobYearHidden(p().dob)}
                      class="h-4 w-4 rounded border-rim accent-accent cursor-pointer"
                    />
                    <span class="text-xs text-muted">{t("profiles.dob_hide_year")}</span>
                  </label>
                </Field>
                <Field label={t("profiles.hometown")}>
                  <input type="text" name="hometown" value={p().hometown ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.homepage")}>
                  <input type="url" name="homepage" value={p().homepage ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.marital")}>
                  <input type="text" name="marital" value={p().marital ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.sexual")}>
                  <input type="text" name="sexual" value={p().sexual ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.politic")}>
                  <input type="text" name="politic" value={p().politic ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.religion")}>
                  <input type="text" name="religion" value={p().religion ?? ""} class={inputClass} />
                </Field>
              </div>
            </Section>

            {/* Interests */}
            <Section title={t("profiles.group_interests")}>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t("profiles.interest")}>
                  <input type="text" name="interest" value={p().interest ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.romance")}>
                  <input type="text" name="romance" value={p().romance ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.likes")}>
                  <input type="text" name="likes" value={p().likes ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.dislikes")}>
                  <input type="text" name="dislikes" value={p().dislikes ?? ""} class={inputClass} />
                </Field>
              </div>
            </Section>

            {/* Culture */}
            <Section title={t("profiles.group_culture")}>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t("profiles.music")}>
                  <input type="text" name="music" value={p().music ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.book")}>
                  <input type="text" name="book" value={p().book ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.tv")}>
                  <input type="text" name="tv" value={p().tv ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.film")}>
                  <input type="text" name="film" value={p().film ?? ""} class={inputClass} />
                </Field>
              </div>
            </Section>

            {/* Work & Education */}
            <Section title={t("profiles.group_work")}>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t("profiles.employment")}>
                  <input type="text" name="employment" value={p().employment ?? ""} class={inputClass} />
                </Field>
                <Field label={t("profiles.education")}>
                  <input type="text" name="education" value={p().education ?? ""} class={inputClass} />
                </Field>
              </div>
            </Section>

            {/* Contact */}
            <Section title={t("profiles.group_contact")}>
              <Field label={t("profiles.contact")}>
                <input type="text" name="contact" value={p().contact ?? ""} class={inputClass} />
              </Field>
              <Field label={t("profiles.channels")}>
                <input type="text" name="channels" value={p().channels ?? ""} class={inputClass} />
              </Field>
            </Section>

            <div class="flex items-center gap-3 pt-2 border-t border-rim">
              <button
                type="submit"
                disabled={saving()}
                class="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-fg
                       hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {saving() ? t("profiles.saving") : t("profiles.save")}
              </button>
              <Show when={!p().is_default}>
                <span class="text-xs text-muted">{t("profiles.profile_name_hint")}</span>
              </Show>
            </div>
          </form>
        )}
      </Show>
    </div>
  );
}

function ProfilePhotoPickerModal(props: {
  nick: string;
  onSelect: (photo: Photo) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [selectedPhoto, setSelectedPhoto] = createSignal<Photo | null>(null);

  const selectedSet = () => {
    const p = selectedPhoto();
    return new Set<string>(p ? [p.resource_id] : []);
  };

  function handleToggle(photo: Photo) {
    setSelectedPhoto((prev) => prev?.resource_id === photo.resource_id ? null : photo);
  }

  return (
    <Portal mount={document.body}>
      <div
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div class="flex flex-col w-full max-w-3xl h-[85vh] bg-surface border border-rim rounded-xl shadow-2xl overflow-hidden">
          <header class="flex items-center justify-between px-4 py-3 border-b border-rim shrink-0">
            <span class="text-sm font-semibold text-txt">{t("profiles.photo_picker_title")}</span>
            <button
              type="button"
              onClick={props.onClose}
              class="p-1.5 rounded-md text-muted hover:text-txt hover:bg-elevated transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div class="flex-1 overflow-hidden min-h-0 p-4">
            <PhotosPicker nick={props.nick} selected={selectedSet} onToggle={handleToggle} />
          </div>

          <footer class="flex items-center justify-between px-4 py-3 border-t border-rim bg-elevated shrink-0">
            <span class="text-xs text-muted truncate max-w-[50%]">
              <Show when={selectedPhoto()} fallback={t("editor.select_to_attach")}>
                {selectedPhoto()!.filename}
              </Show>
            </span>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={props.onClose}
                class="px-3 py-1.5 text-sm rounded-lg border border-rim text-muted hover:bg-surface transition-colors"
              >
                {t("editor.cancel_btn")}
              </button>
              <button
                type="button"
                disabled={!selectedPhoto()}
                onClick={() => { const p = selectedPhoto(); if (p) props.onSelect(p); }}
                class="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent text-accent-fg
                       hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {t("profiles.use_this_photo")}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Portal>
  );
}

function CameraIcon(props: { class?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function GalleryIcon(props: { class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" class={props.class} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function UploadIcon(props: { class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" class={props.class} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

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

function FormSkeleton() {
  return (
    <div class="space-y-8 animate-pulse">
      <div class="rounded-2xl overflow-hidden bg-surface border border-rim shadow-sm">
        <div class="relative w-full bg-elevated" style="aspect-ratio: 3 / 1">
          <div class="absolute -bottom-10 left-5 w-20 h-20 rounded-full ring-4 ring-surface bg-elevated" />
        </div>
        <div class="pt-12 px-5 pb-5 space-y-2">
          <div class="h-5 w-36 rounded bg-elevated" />
          <div class="h-3 w-24 rounded bg-elevated" />
        </div>
      </div>
      {[...Array(3)].map(() => (
        <div class="space-y-3">
          <div class="h-3.5 w-24 rounded bg-elevated" />
          <div class="h-px w-full bg-rim" />
          <div class="grid grid-cols-2 gap-4">
            {[...Array(4)].map(() => (
              <div class="space-y-1.5">
                <div class="h-3 w-20 rounded bg-elevated" />
                <div class="h-9 w-full rounded-lg bg-elevated" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
