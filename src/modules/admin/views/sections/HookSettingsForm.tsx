import { Show, Suspense, createResource, createSignal, type Component } from "solid-js";
import DOMPurify from "dompurify";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { SettingsForm } from "../../types";

/**
 * Admin settings forms for addons (<slug>_plugin_admin) and themes
 * (theme_admin) are Smarty-rendered core field_*.tpl markup, so they are form
 * controls — the app-wide sanitizeHtml() deliberately strips <input> and would
 * empty them. This is admin-only, server-generated markup from PHP that
 * already runs on the hub, so the narrower risk here is script/handler
 * injection, which is what this config blocks.
 */
function purify(html: string): string {
  // "form" is deliberately absent from ALLOWED_TAGS: theme_admin() returns a
  // complete <form action="admin/themes/x">, and nesting that inside ours would
  // be invalid. DOMPurify strips the tag but keeps its children (KEEP_CONTENT
  // defaults true and "form" is not in DEFAULT_FORBID_CONTENTS), so the inputs
  // land in the outer form and FormData picks them all up.
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

const HookSettingsForm: Component<{
  /** Addon slug or theme name — also the resource key, so switching rows refetches. */
  id: string;
  load: (id: string) => Promise<SettingsForm>;
  save: (id: string, fields: Record<string, string | string[]>) => Promise<SettingsForm>;
}> = (props) => {
  const { t } = useI18n();
  const [form, { mutate }] = createResource(() => props.id, (id) => props.load(id));
  const [saving, setSaving] = createSignal(false);

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // The response is the re-rendered form, so the fields show what stored.
      mutate(await props.save(props.id, collect(e.currentTarget as HTMLFormElement)));
      toast.success(t("admin.settings_saved") as string);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const loading = () => <p class="text-xs text-muted">{t("admin.settings_loading")}</p>;

  return (
    <div class="mt-3 pt-3 border-t border-rim">
      {/* Own boundary: reading a pending resource suspends the *nearest*
          Suspense, and AdminView wraps the whole section in one — without this
          the entire list is swapped for its skeleton and remounted, which
          flashes the page and resets the scroll position. */}
      <Suspense fallback={loading()}>
      <Show
        when={form()}
        fallback={
          <Show when={form.error} fallback={loading()}>
            <p class="text-xs text-red-500">{String(form.error?.message ?? form.error)}</p>
          </Show>
        }
      >
        {(f) => (
          <Show
            when={f().html.trim()}
            fallback={<p class="text-xs text-muted">{t("admin.settings_none")}</p>}
          >
          <form
            onSubmit={onSubmit}
            classList={{ "opacity-50 pointer-events-none": saving() }}
            /* Core's markup is Bootstrap-classed and the SPA has no Bootstrap;
               .addon-admin-form in src/index.css gives the controls a baseline. */
            class="addon-admin-form"
            innerHTML={purify(f().html)}
          />
          </Show>
        )}
      </Show>
      </Suspense>
    </div>
  );
};

export default HookSettingsForm;
