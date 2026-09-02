import { Show, createResource, createSignal, type Component } from "solid-js";
import DOMPurify from "dompurify";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchAddonSettings, saveAddonSettings } from "../../api";

/**
 * Addon admin forms are Smarty-rendered core field_*.tpl markup, so they are
 * form controls — the app-wide sanitizeHtml() deliberately strips <input> and
 * would empty them. This is admin-only, server-generated markup from PHP that
 * already runs on the hub, so the narrower risk here is script/handler
 * injection, which is what this config blocks.
 */
function purify(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "div", "span", "p", "br", "small", "sup", "label", "fieldset", "legend",
      "input", "select", "option", "optgroup", "textarea", "button",
      "a", "b", "i", "em", "strong", "code", "pre", "hr",
      "table", "thead", "tbody", "tr", "td", "th",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
    ],
    ALLOWED_ATTR: [
      "id", "class", "for", "name", "type", "value", "checked", "selected",
      "placeholder", "rows", "cols", "size", "maxlength", "min", "max", "step",
      "multiple", "disabled", "readonly", "title", "href", "rel", "target",
      "data-on", "data-off",
    ],
    FORBID_ATTR: ["formaction", "form", "srcdoc"],
  });
}

/** Scrape the rendered form. Unchecked boxes are absent from FormData, which is
 *  what the addons expect — they all read `isset($_POST[x]) ? … : 0`. */
function collect(form: HTMLFormElement): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of new FormData(form)) {
    if (v instanceof File) continue; // no upload path through the JSON body
    const prev = out[k];
    if (prev === undefined) out[k] = v;
    else if (Array.isArray(prev)) prev.push(v);
    else out[k] = [prev, v];
  }
  return out;
}

const AddonSettingsForm: Component<{ slug: string }> = (props) => {
  const { t } = useI18n();
  const [form, { mutate }] = createResource(() => props.slug, fetchAddonSettings);
  const [saving, setSaving] = createSignal(false);

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // The response is the re-rendered form, so the fields show what stored.
      mutate(await saveAddonSettings(props.slug, collect(e.currentTarget as HTMLFormElement)));
      toast.success(t("admin.addon_settings_saved") as string);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="mt-3 pt-3 border-t border-rim">
      <Show
        when={form()}
        fallback={
          <p class="text-xs text-muted">
            {form.error ? String(form.error.message ?? form.error) : t("admin.addon_settings_loading")}
          </p>
        }
      >
        {(f) => (
          <form
            onSubmit={onSubmit}
            classList={{ "opacity-50 pointer-events-none": saving() }}
            /* Core's markup is Bootstrap-classed and the SPA has no Bootstrap;
               .addon-admin-form in src/index.css gives the controls a baseline. */
            class="addon-admin-form"
            innerHTML={purify(f().html)}
          />
        )}
      </Show>
    </div>
  );
};

export default AddonSettingsForm;
