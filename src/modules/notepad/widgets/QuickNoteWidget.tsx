import { A } from "@solidjs/router";
import { MdOutlineEdit_note } from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import NoteComposer from "@/shared/editor/composers/NoteComposer";
import { Card } from "@ui/Card";

// Lets you jot a private note from any page's sidebar without navigating to
// /notepad. Reuses the same composer/scope ("note:new") as the notepad page
// itself, so drafts and behavior stay identical.
export default function QuickNoteWidget() {
  const auth = useAuth();
  const { t } = useI18n();

  return (
    <Card raised class="overflow-hidden">
      <div class="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between">
        <span class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
          <MdOutlineEdit_note size={14} />
          {t("widgets.note_quick")}
        </span>
        <A href="/notepad" class="text-xs text-accent hover:underline">
          {t("widgets.view_all")}
        </A>
      </div>

      <div class="px-3.5 pb-3.5">
        <NoteComposer
          nick={auth()?.nick || ""}
          minimal
          onSaved={() => toast.success(t("notepad.quick_saved"))}
        />
      </div>
    </Card>
  );
}
