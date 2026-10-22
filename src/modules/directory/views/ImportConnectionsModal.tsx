import { createSignal, For, Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { connectToChannel } from "../connections/api";
import { parseFollowingCsv } from "../connections/csv";
import { refetch } from "../connections/store";

import { Modal, ModalPanel } from "@ui/Modal";
import { Button } from "@ui/Button";
type RowStatus = "pending" | "connecting" | "connected" | "already" | "failed";

interface Row {
  address: string;
  status: RowStatus;
  message?: string;
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  async function runNext(): Promise<void> {
    const i = next++;
    if (i >= items.length) return;
    await worker(items[i]);
    return runNext();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const ImportConnectionsModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const [rows, setRows] = createSignal<Row[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [parseError, setParseError] = createSignal<string | null>(null);

  function updateRow(address: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.address === address ? { ...r, ...patch } : r)));
  }

  async function handleFile(file: File) {
    setParseError(null);
    const text = await file.text();
    const addresses = parseFollowingCsv(text);
    if (addresses.length === 0) {
      setParseError(t("directory.import_connections_no_addresses"));
      setRows([]);
      return;
    }
    setRows(addresses.map((address) => ({ address, status: "pending" as const })));
  }

  async function handleImport() {
    setBusy(true);
    try {
      await runWithConcurrency(rows(), 3, async (row) => {
        updateRow(row.address, { status: "connecting" });
        try {
          await connectToChannel(row.address);
          updateRow(row.address, { status: "connected" });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const already = /already|exist/i.test(message);
          updateRow(row.address, { status: already ? "already" : "failed", message });
        }
      });
      refetch();
    } finally {
      setBusy(false);
    }
  }

  const summary = () => {
    const list = rows();
    return {
      connected: list.filter((r) => r.status === "connected").length,
      already: list.filter((r) => r.status === "already").length,
      failed: list.filter((r) => r.status === "failed").length,
    };
  };

  const done = () => rows().length > 0 && rows().every((r) => r.status !== "pending" && r.status !== "connecting");

  function handleClose() {
    if (busy()) return;
    setRows([]);
    setParseError(null);
    props.onClose();
  }

  return (
    <Show when={props.open}>
      <Modal onClose={handleClose} class="z-50">
        <ModalPanel
          title={t("directory.import_connections_title")}
          description={t("directory.import_connections_desc")}
          onClose={handleClose}
          size="lg"
          class="relative max-h-[90vh] flex flex-col overflow-hidden"
        >
          <div class="flex-1 overflow-y-auto p-5 space-y-4">
            <div class="space-y-2">
              <label class="block text-xs font-medium text-muted">
                {t("directory.import_connections_file_label")}
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={busy()}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) handleFile(file);
                }}
                class="block w-full text-sm text-txt file:mr-3 file:px-3 file:py-1.5 file:rounded-lg
                       file:border-0 file:bg-elevated file:text-txt file:text-sm
                       file:cursor-pointer cursor-pointer"
              />
            </div>

            <Show when={parseError()}>
              <p class="text-sm text-danger-txt">{parseError()}</p>
            </Show>

            <Show when={rows().length > 0}>
              <Show when={done()}>
                <p class="text-sm text-txt">
                  {t("directory.import_connections_summary", {
                    connected: String(summary().connected),
                    already: String(summary().already),
                    failed: String(summary().failed),
                  })}
                </p>
              </Show>

              <ul class="divide-y divide-rim border border-rim rounded-lg overflow-hidden">
                <For each={rows()}>
                  {(row) => (
                    <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span class="truncate text-txt">{row.address}</span>
                      <span
                        class={
                          row.status === "connected" ? "text-success-txt" :
                          row.status === "already"   ? "text-muted" :
                          row.status === "failed"    ? "text-danger-txt" :
                          row.status === "connecting" ? "text-accent" :
                          "text-muted"
                        }
                        title={row.message}
                      >
                        {row.status === "connected"  ? t("directory.import_connections_status_connected") :
                         row.status === "already"    ? t("directory.import_connections_status_already") :
                         row.status === "failed"     ? t("directory.import_connections_status_failed") :
                         row.status === "connecting" ? t("directory.import_connections_running") :
                         "—"}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>

          <Show when={rows().length > 0}>
            <div class="px-5 py-4 border-t border-rim">
              <Button class="w-full" disabled={busy() || done()} onClick={handleImport}>
                {busy() ? t("directory.import_connections_running") : t("directory.import_connections_start_btn")}
              </Button>
            </div>
          </Show>
        </ModalPanel>
      </Modal>
    </Show>
  );
};

export default ImportConnectionsModal;
