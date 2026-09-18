import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";
import { queryClient } from "@utsukta/spa-core/lib/query-client";

export interface ProfileListItem {
  id: number;
  profile_name: string;
  is_default: boolean;
  fullname: string;
  pdesc: string;
}

export interface ProfileData extends ProfileListItem {
  homepage: string;
  hometown: string;
  gender: string;
  dob: string;
  about: string;
  keywords: string;
  hide_friends: number;
  publish: number;
  marital: string;
  sexual: string;
  politic: string;
  religion: string;
  music: string;
  book: string;
  tv: string;
  film: string;
  interest: string;
  romance: string;
  employment: string;
  education: string;
  likes: string;
  dislikes: string;
  contact: string;
  channels: string;
  avatar_l: string | null;
  cover_url: string | null;
}

export interface ProfilesListResult {
  profiles: ProfileListItem[];
  multiProfilesEnabled: boolean;
  defaultProfileId: number | null;
}

export async function fetchProfiles(): Promise<ProfilesListResult> {
  const res = await apiFetch("/spa/profiles");
  if (!res.ok) throw new Error(`Failed to load profiles: ${res.status}`);
  const json = await res.json();
  const meta = json.meta ?? {};
  return {
    profiles: (json.data ?? []) as ProfileListItem[],
    multiProfilesEnabled: meta.multi_profiles_enabled ?? false,
    defaultProfileId: meta.default_profile_id ?? null,
  };
}

export async function fetchProfile(id: string | number): Promise<ProfileData> {
  const res = await apiFetch(`/spa/profiles/${id}`);
  if (!res.ok) throw new Error(`Failed to load profile: ${res.status}`);
  const { data } = await res.json();
  return data as ProfileData;
}

export async function createProfile(profile_name: string): Promise<number> {
  const res = await apiFetch("/spa/profiles/new", {
    method: "POST",
    body: JSON.stringify({ profile_name }),
  });
  if (!res.ok) throw new Error("Failed to create profile");
  const { data } = await res.json();
  return data.id as number;
}

export async function saveProfile(
  id: string | number,
  payload: Partial<ProfileData>,
): Promise<void> {
  const res = await apiFetch(`/spa/profiles/${id}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error?.message ?? "Save failed");
  }
  // The profile page / contact card read /spa/profile/:nick under their own
  // query keys; without this they serve the pre-edit about text for staleTime.
  queryClient.invalidateQueries({
    predicate: (q) => ["channel-profile", "contact-card"].includes(q.queryKey[0] as string),
  });
}

export async function deleteProfile(id: string | number): Promise<void> {
  const res = await apiFetch(`/spa/profiles/${id}/delete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error?.message ?? "Delete failed");
  }
}

export interface AvatarUploadResult {
  avatar_l?: string;
  avatar_m?: string;
  avatar_s?: string;
  cover_url?: string;
}

function avatarExt(mimetype: string): string {
  if (mimetype === "image/gif") return "gif";
  if (mimetype === "image/webp") return "webp";
  if (mimetype === "image/png") return "png";
  return "jpg";
}

export function uploadPhoto(
  type: "avatar" | "cover",
  blob: Blob,
  onProgress?: (pct: number) => void,
): Promise<AvatarUploadResult> {
  return new Promise(async (resolve, reject) => {
    const token = await getCsrfToken().catch(() => "");
    const fd = new FormData();
    const ext = type === "avatar" ? avatarExt(blob.type) : "jpg";
    fd.append("file", blob, `${type}.${ext}`);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/spa/avatar?type=${type}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRF-Token", token);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve((json.data ?? {}) as AvatarUploadResult);
        } catch {
          reject(new Error("Invalid upload response"));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(fd);
  });
}
