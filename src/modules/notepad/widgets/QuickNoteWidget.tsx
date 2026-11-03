import { A } from "@solidjs/router";
import { MdOutlineEdit_note } from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import NoteComposer from "@/shared/editor/composers/NoteComposer";
import { WidgetShell } from "@ui/WidgetShell";

// Lets you jot a private note from any page's sidebar without navigating to
// /notepad. Reuses the same composer/scope ("note:new") as the notepad page
// itself, so drafts and behavior stay identical.
export default function QuickNoteWidget() {
  const auth = useAuth();
  const { t } = useI18n();

  return (
    <WidgetShell
      icon={<MdOutlineEdit_note size={14} />}
      title={t("widgets.note_quick")}
      actions={
        <A href="/notepad" class="text-xs text-accent hover:underline">
          {t("widgets.view_all")}
        </A>
      }
    >
      <div class="px-(--ws-px) py-3">
        <NoteComposer
          nick={auth()?.nick || ""}
          minimal
          onSaved={() => toast.success(t("notepad.quick_saved"))}
        />
      </div>
    </WidgetShell>
  );
}
