// Client for src/ffmpeg-worker.js — @ffmpeg/core running in a classic Web
// Worker. Shared by the Tools video editor and the Jellyfin clipper.
export const FFMPEG_BASE = import.meta.env.BASE_URL + "ffmpeg/";

// ── Worker-based FFmpeg wrapper ───────────────────────────────────────────────
export class FFmpegWorker {
  private w: Worker;
  private pending = new Map<number, [(v: unknown) => void, (e: Error) => void]>();
  private seq = 0;
  onProgress?: (ratio: number) => void;

  constructor(url: string) {
    this.w = new Worker(url);
    this.w.onmessage = ({ data }) => {
      if (data.type === "progress") {
        this.onProgress?.(data.ratio as number);
        return;
      }
      const cb = this.pending.get(data.id as number);
      if (!cb) return;
      this.pending.delete(data.id as number);
      if (data.type === "error") cb[1](new Error(data.message as string));
      else cb[0](data);
    };
    this.w.onerror = (e) => {
      const err = new Error(e.message ?? "Worker error");
      for (const [, [, reject]] of this.pending) reject(err);
      this.pending.clear();
    };
  }

  private rpc(type: string, payload: unknown, transfer?: Transferable[]): Promise<Record<string, unknown>> {
    const id = this.seq++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, [resolve as (v: unknown) => void, reject]);
      this.w.postMessage({ id, type, payload }, (transfer ?? []) as StructuredSerializeOptions);
    });
  }

  init(baseUrl: string) { return this.rpc("init", { baseUrl }); }
  write(name: string, buffer: ArrayBuffer) { return this.rpc("write", { name, buffer }, [buffer]); }
  exec(args: string[], durationSec: number): Promise<{ ret: number }> {
    return this.rpc("exec", { args, durationSec }) as Promise<{ ret: number }>;
  }
  read(name: string): Promise<ArrayBuffer> {
    return this.rpc("read", { name }).then((d) => d["buffer"] as ArrayBuffer);
  }
  unlink(name: string) { return this.rpc("unlink", { name }); }
  terminate() { this.w.terminate(); }
}
