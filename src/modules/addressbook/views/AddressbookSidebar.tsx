import { createSignal, Show } from "solid-js";
import { useLocation } from "@solidjs/router";
import { MdOutlineAdd, MdOutlineEdit, MdOutlineDelete, MdOutlineUpload, MdOutlineDownload } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import {
  createAddressbook,
  renameAddressbook,
  deleteAddressbook,
  importVcf,
  type Addressbook,
} from "../api";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import PageActions from "@/shared/views/layout/PageActions";

const btnClass =
  "flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-muted " +
  "hover:bg-elevated hover:text-txt transition-colors disabled:opacity-50";

interface Props {
  book?: Addressbook;
  onCreated: (id: number) => void;
  onChanged: () => void;
  onDeleted: () => void;
}

export default function AddressbookSidebar(props: Props) {
  const { t } = useI18n();
  const [mode, setMode] = createSignal<"idle" | "create" | "rename">("idle");
  const [name, setName] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  let fileInput: HTMLInputElement | undefined;
  // Inside a book on mobile this sidebar is hidden, so its book actions join
  // the section's sheet group (same label: the book's name). On the list page
  // the sidebar itself is on screen. New/rename need its inline form, so they
  // stay there.
  const location = useLocation();
  const inBook = () => /^\/cdav\/addressbook\/[^/]+/.test(location.pathname);

  const run = async (fn: () => Promise<void>, fallback?: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      const msg = fallback ?? (t("addressbook.save_failed") as string);
      toast.error(err instanceof Error ? err.message : msg);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: Event) => {
    e.preventDefault();
    const value = name().trim();
    if (!value) return;

    run(async () => {
      if (mode() === "create") {
        const book = await createAddressbook(value);
        props.onCreated(book.id);
      } else if (props.book) {
        await renameAddressbook(props.book.id, value);
        props.onChanged();
      }
      setMode("idle");
      setName("");
    });
  };

  const remove = () => {
    const book = props.book;
    if (!book) return;
    if (!confirm(t("addressbook.delete_addressbook_confirm") as string)) return;

    run(async () => {
      await deleteAddressbook(book.id);
      props.onDeleted();
    });
  };

  const onFile = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    const book = props.book;
    input.value = ""; // let the same file be picked again after a failure
    if (!file || !book) return;

    run(async () => {
      await importVcf(book.id, file);
      props.onChanged();
    }, t("addressbook.import_failed") as string);
  };

  return (
    <div class="space-y-1">
      <PageActions mobileOnly label={props.book?.displayname} actions={[
        { label: busy() ? t("addressbook.importing") : t("addressbook.import_vcf"), icon: MdOutlineUpload,
          disabled: busy(), onClick: () => fileInput?.click(), show: !!props.book && inBook() },
        { label: t("addressbook.export_vcf"), icon: MdOutlineDownload, href: props.book?.exportUrl,
          download: `${props.book?.displayname}.vcf`, show: !!props.book && inBook() },
        { label: t("addressbook.delete_addressbook"), icon: MdOutlineDelete, disabled: busy(), onClick: remove,
          show: !!props.book && inBook() },
      ]} />
      <Show when={mode() !== "idle"}>
        <form onSubmit={submit} class="space-y-2 pb-2">
          <Input
            class="w-full"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder={t("addressbook.addressbook_name") as string}
            aria-label={t("addressbook.addressbook_name") as string}
            autofocus
          />
          <div class="flex gap-2">
            <Button size="sm" class="flex-1" type="submit" disabled={busy() || !name().trim()}>
              {busy()
                ? t("addressbook.saving")
                : mode() === "create"
                  ? t("addressbook.create")
                  : t("addressbook.rename")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setMode("idle"); setName(""); }}>
              {t("addressbook.cancel")}
            </Button>
          </div>
        </form>
      </Show>

      <button type="button" class={btnClass} disabled={busy()}
              onClick={() => { setMode("create"); setName(""); }}>
        <MdOutlineAdd class="w-4 h-4 shrink-0" />
        {t("addressbook.new_addressbook")}
      </button>

      <Show when={props.book}>
        {(book) => (
          <>
            <button type="button" class={btnClass} disabled={busy()}
                    onClick={() => { setMode("rename"); setName(book().displayname); }}>
              <MdOutlineEdit class="w-4 h-4 shrink-0" />
              {t("addressbook.rename_addressbook")}
            </button>

            <button type="button" class={btnClass} disabled={busy()}
                    onClick={() => fileInput?.click()}>
              <MdOutlineUpload class="w-4 h-4 shrink-0" />
              {busy() ? t("addressbook.importing") : t("addressbook.import_vcf")}
            </button>
            <input ref={fileInput} type="file" accept=".vcf,text/vcard,text/directory"
                   class="hidden" onChange={onFile} />

            {/* Sabre's VCFExportPlugin serves this — a real navigation, not a fetch. */}
            <a href={book().exportUrl} class={btnClass} download={`${book().displayname}.vcf`}>
              <MdOutlineDownload class="w-4 h-4 shrink-0" />
              {t("addressbook.export_vcf")}
            </a>

            <button type="button" class={`${btnClass} hover:text-danger-txt`} disabled={busy()}
                    onClick={remove}>
              <MdOutlineDelete class="w-4 h-4 shrink-0" />
              {t("addressbook.delete_addressbook")}
            </button>
          </>
        )}
      </Show>
    </div>
  );
}
