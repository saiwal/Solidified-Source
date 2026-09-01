// Layout template manager (/webpages/:nick/layouts) — CRUD for reusable,
// named widget arrangements (sidebar, header, top banner, footer) that
// individual webpages can be assigned to (see WebpageComposer's "Page
// layout" select, which can also create templates inline). Owner only.
// Mirrors classic Hubzilla's PDL layouts: a template is edited once and every
// page assigned to it picks up the change, instead of each page carrying its
// own one-off widget list.
//
// Placing widgets happens in the real header/contentTop/right/footer regions,
// not a separate editor here — same mechanism WebpageComposer.tsx uses:
// selecting a template drives the app shell's currentPageTemplateId, so
// Layout.tsx's real, editable <Slot>s show that template's widgets right on
// this screen. Metadata (name/usage/delete) stays local to this list.

import { createEffect, createMemo, createSignal, onCleanup, For, Show } from "solid-js";
import { useParams, A, useNavigate } from "@solidjs/router";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  useTemplates,
  loadTemplates,
  createTemplate,
  renameTemplate,
  deleteTemplate,
  setTemplateChrome,
  templateUsageCount,
  TEMPLATE_SLOTS,
} from "@utsukta/spa-core/store/widget-templates";
import { setCurrentPageTemplateId } from "../store";
import { editingWidgets, setEditingWidgets } from "@utsukta/spa-core/store/widget-layout";
import TemplateNameForm from "@/shared/views/TemplateNameForm";
import { MdFillAdd, MdOutlineDashboard, MdOutlineEdit, MdFillCheck } from "solid-icons/md";

function templateWidgetCount(tpl: { slots: Partial<Record<string, unknown[]>> } | undefined): number {
  if (!tpl) return 0;
  return TEMPLATE_SLOTS.reduce((sum, slot) => sum + (tpl.slots[slot]?.length ?? 0), 0);
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function LayoutTemplatesView() {
  const { t } = useI18n();
  const params = useParams<{ nick: string }>();
  const auth = useAuth();
  const navigate = useNavigate();

  const nick = () => params.nick || auth()?.nick || "";

  createEffect(() => {
    if ((auth as any).loading || !nick()) return;
    if (auth()?.nick !== nick()) navigate(`/page/${nick()}/home`, { replace: true });
  });

  createEffect(() => void loadTemplates());

  // <For> keys rows by reference, so the array it iterates must contain
  // stable values across re-renders — plain id strings, not fresh wrapper
  // objects (which would make every row look "new" on every store update).
  // Each row reads its own template reactively via `tpl(id)` below.
  const templates = useTemplates();
  const templateIds = createMemo(() => Object.keys(templates()?.templates ?? {}));
  const tpl = (id: string) => templates()?.templates[id];

  const [creating, setCreating] = createSignal(false);
  const [renamingId, setRenamingId] = createSignal<string | null>(null);

  // Which template's regions the app shell should currently show/allow
  // editing for — same signal PageView.tsx and WebpageComposer.tsx drive.
  // Only one at a time, since there's only one set of real regions on screen.
  const [selectedTemplateId, setSelectedTemplateId] = createSignal<string | null>(null);
  createEffect(() => setCurrentPageTemplateId(selectedTemplateId()));
  onCleanup(() => setCurrentPageTemplateId(null));

  const editTemplate = (id: string) => {
    if (selectedTemplateId() === id) {
      setSelectedTemplateId(null);
      setEditingWidgets(false);
    } else {
      setSelectedTemplateId(id);
      setEditingWidgets(true);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const count = templateUsageCount(id);
    const message =
      count > 0
        ? t("webpages.delete_template_in_use_confirm")
            .replace("{{name}}", name)
            .replace("{{count}}", String(count))
        : `${t("webpages.delete")} "${name}"?`;
    if (!confirm(message)) return;
    if (selectedTemplateId() === id) {
      setSelectedTemplateId(null);
      setEditingWidgets(false);
    }
    await deleteTemplate(id);
  };

  return (
    <div class="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4">
      {/* Header */}
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-lg font-semibold text-txt">{t("webpages.layout_templates_title")}</h1>
          <A href={`/webpages/${nick()}`} class="text-xs text-muted hover:text-accent transition-colors">
            {t("webpages.back")}
          </A>
        </div>
        <button
          onClick={() => setCreating(!creating())}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent
                 text-accent-fg text-sm hover:opacity-90 transition-opacity shrink-0"
        >
          <MdFillAdd size={16} />
          {t("webpages.new_template")}
        </button>
      </div>

      <p class="text-xs text-muted">{t("webpages.layout_templates_desc")}</p>

      <Show when={selectedTemplateId()}>
        {(id) => (
          <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-accent/50 bg-accent/10 text-xs text-txt">
            <span>
              {t("webpages.editing_template_notice").replace("{{name}}", tpl(id())?.name ?? "")}
              <Show when={tpl(id())?.chrome === "zen"}>
                {" "}
                <span class="text-amber-500">{t("webpages.zen_chrome_notice")}</span>
              </Show>
            </span>
            <button
              onClick={() => editTemplate(id())}
              class="px-2 py-1 rounded-md text-xs font-medium text-accent hover:bg-elevated transition-colors shrink-0"
            >
              {t("webpages.done_editing_template")}
            </button>
          </div>
        )}
      </Show>

      <Show when={creating()}>
        <TemplateNameForm
          onCancel={() => setCreating(false)}
          onSubmit={async (name) => {
            await createTemplate(name);
            setCreating(false);
          }}
        />
      </Show>

      <div class="border-t border-rim" />

      <Show
        when={templateIds().length > 0}
        fallback={
          <div class="py-12 flex flex-col items-center gap-3 text-center">
            <MdOutlineDashboard class="w-10 h-10 text-muted" />
            <p class="text-sm text-muted">{t("webpages.no_templates")}</p>
          </div>
        }
      >
        <div class="space-y-2">
          <For each={templateIds()}>
            {(id) => (
              <div class="border border-rim rounded-xl overflow-hidden">
                <Show
                  when={renamingId() !== id}
                  fallback={
                    <div class="p-3">
                      <TemplateNameForm
                        initial={tpl(id)?.name}
                        onCancel={() => setRenamingId(null)}
                        onSubmit={async (name) => {
                          await renameTemplate(id, name);
                          setRenamingId(null);
                        }}
                      />
                    </div>
                  }
                >
                  <div class="flex items-center justify-between gap-2 p-3">
                    <div class="min-w-0 flex-1 flex items-center gap-2">
                      <span class="font-medium text-sm text-txt truncate">{tpl(id)?.name}</span>
                      <span class="text-xs text-muted shrink-0">
                        {templateWidgetCount(tpl(id))} {t("webpages.widgets_label")}
                      </span>
                      <span class="text-xs shrink-0">
                        <Show
                          when={templateUsageCount(id) > 0}
                          fallback={<span class="text-amber-500">{t("webpages.template_unused")}</span>}
                        >
                          <span class="text-muted">
                            · {templateUsageCount(id)} {t("webpages.template_pages_label")}
                          </span>
                        </Show>
                      </span>
                    </div>
                    <select
                      value={tpl(id)?.chrome ?? "default"}
                      onChange={(e) =>
                        void setTemplateChrome(id, e.currentTarget.value as "default" | "zen" | "focus" | "wide" | "compact")
                      }
                      class="bg-elevated border border-rim rounded-lg px-2 py-1 text-xs text-txt shrink-0"
                      title={t("webpages.chrome_mode_hint")}
                    >
                      <option value="default">{t("webpages.chrome_mode_default")}</option>
                      <option value="compact">{t("webpages.chrome_mode_compact")}</option>
                      <option value="wide">{t("webpages.chrome_mode_wide")}</option>
                      <option value="focus">{t("webpages.chrome_mode_focus")}</option>
                      <option value="zen">{t("webpages.chrome_mode_zen")}</option>
                    </select>
                    <div class="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => editTemplate(id)}
                        aria-pressed={selectedTemplateId() === id && editingWidgets()}
                        class="p-1.5 rounded-md transition-colors"
                        classList={{
                          "bg-accent text-accent-fg": selectedTemplateId() === id && editingWidgets(),
                          "text-muted hover:text-txt hover:bg-elevated": !(selectedTemplateId() === id && editingWidgets()),
                        }}
                        aria-label={t("webpages.edit_widgets")}
                        title={t("webpages.edit_widgets")}
                      >
                        <Show when={selectedTemplateId() === id && editingWidgets()} fallback={<MdOutlineEdit size={14} />}>
                          <MdFillCheck size={14} />
                        </Show>
                      </button>
                      <button
                        onClick={() => setRenamingId(id)}
                        class="px-2 py-1 rounded-md text-xs text-muted hover:text-txt hover:bg-elevated transition-colors"
                      >
                        {t("webpages.rename")}
                      </button>
                      <button
                        onClick={() => void handleDelete(id, tpl(id)?.name ?? "")}
                        class="px-2 py-1 rounded-md text-xs text-muted hover:text-red-500 hover:bg-elevated transition-colors"
                      >
                        {t("webpages.delete")}
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
