import type { FileMeta, FileAcl } from "@/modules/files/api";
import type { Photo } from "@/modules/photos/api/api";

export type AttachmentSource = "upload" | "cloud-file" | "photo";
export type AttachmentStatus = "uploading" | "ready" | "error";

export interface Attachment {
  id: string;
  source: AttachmentSource;
  status: AttachmentStatus;
  progress: number;
  filename: string;
  isImage: boolean;
  isVideo: boolean;
  isAudio: boolean;
  thumbUrl?: string;
  insertUrl?: string;
  photoPageUrl?: string;
  hash?: string;
  revision?: number;
  resourceId?: string;
  altText?: string;
  posterUrl?: string;
  file?: File;
  error?: string;
}

export interface AttachmentStore {
  attachments: () => Attachment[];
  uploading: () => boolean;
  addUploads: (files: FileList | File[]) => void;
  addVideoWithThumbnail: (video: File, thumbnail: File) => void;
  addCloudFiles: (files: FileMeta[]) => void;
  addPhotos: (photos: Photo[]) => void;
  remove: (id: string) => void;
  setAltText: (id: string, text: string) => void;
  setAltByUrl: (url: string, text: string) => void;
  insertBBCode: (id: string) => string;
  /** Apply post ACL to all attachments (now and future uploads). null = use channel defaults. */
  setAcl: (acl: FileAcl | null) => void;
  clear: () => void;
}

export type { FileAcl };
