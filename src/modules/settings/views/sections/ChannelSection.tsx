import { Show, For, createSignal, createUniqueId } from "solid-js";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchChannelSettings, saveChannelSettings } from "../../api/api";
import { useSectionForm } from "../../store/useSectionForm";
import { SaveBar, Group, Field, SwitchRow, inputClass } from "../../store/FormHelpers";
import { useI18n } from "@utsukta/spa-core/i18n";
import FilterRuleBuilder from "@/shared/views/FilterRuleBuilder";
import { MdOutlineFilter_alt, MdOutlineManage_accounts, MdOutlineShield, MdOutlineTune } from "solid-icons/md";

import Modal from "@/shared/views/Modal";
interface PermRow {
  key: string;
  label: string;
  value: number;
  help: string;
  options: Record<string, string>;
}

const NUMBER_ROW_INPUT = `w-16 shrink-0 px-2 py-1.5 rounded-lg border border-rim bg-base text-txt
  text-sm text-center hover:border-rim-strong focus:outline-none
  focus:border-rim-strong transition-colors`;

export default function ChannelSection() {
  const { t } = useI18n();
  const { data, saving, handleSubmit } = useSectionForm({
    section: "channel",
    fetcher: fetchChannelSettings,
    saver: saveChannelSettings,
    numericFields: ["allow_location", "adult", "maxreq", "expire", "group_actor"],
    checkboxFields: ["allow_location", "adult"],
  });

  // The permission-limits modal renders in a Portal (outside the <form> DOM tree),
  // so its edits live in these signals and are mirrored into hidden form inputs.
  const [roleSel, setRoleSel] = createSignal<string | null>(null);
  const [permOpen, setPermOpen] = createSignal(false);
  const [permOverrides, setPermOverrides] = createSignal<Record<string, number>>({});
  const [gaOverride, setGaOverride] = createSignal<number | null>(null);

  // The filter builder is not a form input, so its value rides in a hidden field.
  // null = untouched, fall back to whatever the server sent.
  const [incl, setIncl] = createSignal<string | null>(null);
  const [excl, setExcl] = createSignal<string | null>(null);
  const inclVal = () => incl() ?? data()?.message_filter_incl ?? "";
  const exclVal = () => excl() ?? data()?.message_filter_excl ?? "";

  const effRole = () => roleSel() ?? data()?.permissions_role ?? "";
  const gaVal = () => gaOverride() ?? data()?.group_actor ?? 0;
  const permRows = (): PermRow[] =>
    (data()?.permiss_arr ?? []).map(([key, label, value, help, options]) => ({
      key, label, value: permOverrides()[key] ?? value, help, options,
    }));

  const expireHint = () => {
    const sys = data()?.expire_sys ?? 0;
    return (
      t("settings.channel_expire_hint") +
      (sys > 0 ? " " + t("settings.channel_expire_site", { days: String(sys) }) : "")
    );
  };

  const titleId = createUniqueId();
  return (
    <SubPageContent title={t("settings.title_channel")} description={t("settings.desc_channel")}>
      <Show when={data()} fallback={<Skeleton />}>
        {(d) => (
          <form onSubmit={handleSubmit} class="space-y-5">

            {/* Channel role */}
            <Group
              icon={<MdOutlineManage_accounts size={18} />}
              title={t("settings.channel_role_title")}
              desc={t("settings.channel_role_desc")}
            >
              <div class="py-2.5">
                <Field label={t("settings.channel_role")} hint={t("settings.channel_role_hint")}>
                  <select
                    name="permissions_role"
                    required
                    class={inputClass}
                    onChange={(e) => setRoleSel(e.currentTarget.value)}
                  >
                    <Show when={d().permissions_role === ""}>
                      <option value="" disabled selected>
                        {t("settings.channel_role_select")}
                      </option>
                    </Show>
                    <For each={Object.entries(d().role_options)}>
                      {([key, label]) => (
                        <option value={key} selected={key === d().permissions_role}>
                          {label}
                        </option>
                      )}
                    </For>
                  </select>
                </Field>
              </div>
              <Show when={effRole() === "custom"}>
                <div class="flex items-center justify-between gap-4 py-2.5">
                  <span class="min-w-0">
                    <span class="block text-sm text-txt">{t("settings.privacy_perm_limits")}</span>
                    <span class="block text-xs text-muted">{t("settings.privacy_perm_limits_desc")}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPermOpen(true)}
                    class="shrink-0 px-3 py-1.5 text-sm rounded-lg border border-rim bg-base text-txt
                           hover:border-rim-strong transition-colors"
                  >
                    {t("settings.channel_perm_limits_open")}
                  </button>
                </div>
                {/* Mirrors of the modal's state — these are what actually submit */}
                <For each={permRows()}>
                  {(p) => <input type="hidden" name={p.key} value={p.value} />}
                </For>
                <input type="hidden" name="group_actor" value={gaVal()} />
              </Show>
            </Group>

            {/* Basics */}
            <Group
              icon={<MdOutlineTune size={18} />}
              title={t("settings.channel_basic_title")}
              desc={t("settings.channel_basic_desc")}
            >
              <div class="py-2.5 space-y-4">
                <Field label={t("settings.channel_timezone")}>
                  <select name="timezone" class={inputClass}>
                    <For each={Object.entries(d().timezones)}>
                      {([continent, zones]) => (
                        <optgroup label={continent}>
                          <For each={Object.entries(zones)}>
                            {([zoneId, city]) => (
                              <option value={zoneId} selected={zoneId === d().timezone}>
                                {city}
                              </option>
                            )}
                          </For>
                        </optgroup>
                      )}
                    </For>
                  </select>
                </Field>
                <Field label={t("settings.channel_defloc")} hint={t("settings.channel_defloc_hint")}>
                  <input type="text" name="defloc" value={d().defloc} class={inputClass} />
                </Field>
              </div>
              <SwitchRow name="allow_location" label={t("settings.channel_allow_location")} checked={!!d().allow_location} />
              <SwitchRow name="adult" label={t("settings.channel_adult")} hint={t("settings.channel_adult_hint")} checked={!!d().adult} />
              <div class="flex items-center justify-between gap-4 py-2.5">
                <span class="min-w-0">
                  <span class="block text-sm text-txt">{t("settings.channel_maxreq")}</span>
                  <span class="block text-xs text-muted">{t("settings.channel_maxreq_hint")}</span>
                </span>
                <input type="number" name="maxreq" min="0" value={d().maxreq} class={NUMBER_ROW_INPUT} />
              </div>
            </Group>

            {/* Content & import */}
            <Group
              icon={<MdOutlineFilter_alt size={18} />}
              title={t("settings.channel_content_title")}
              desc={t("settings.channel_content_desc")}
            >
              <div class="py-2.5 space-y-4">
                <Field label={t("settings.channel_photo_path")} hint={t("settings.channel_path_hint")}>
                  <input type="text" name="photo_path" value={d().photo_path} class={inputClass} />
                </Field>
                <Field label={t("settings.channel_attach_path")} hint={t("settings.channel_path_hint")}>
                  <input type="text" name="attach_path" value={d().attach_path} class={inputClass} />
                </Field>
                <div class="flex items-center justify-between gap-4">
                  <span class="min-w-0">
                    <span class="block text-sm text-txt">{t("settings.channel_expire")}</span>
                    <span class="block text-xs text-muted">{expireHint()}</span>
                  </span>
                  <input type="number" name="expire" min="0" value={d().expire} class={NUMBER_ROW_INPUT} />
                </div>
                <Field label={t("settings.channel_filter_incl")} hint={t("settings.channel_filter_hint")}>
                  <FilterRuleBuilder value={inclVal()} onChange={setIncl} rows={3} />
                  <input type="hidden" name="message_filter_incl" value={inclVal()} />
                </Field>
                <Field label={t("settings.channel_filter_excl")} hint={t("settings.channel_filter_hint")}>
                  <FilterRuleBuilder value={exclVal()} onChange={setExcl} rows={3} />
                  <input type="hidden" name="message_filter_excl" value={exclVal()} />
                </Field>
              </div>
            </Group>

            <SaveBar saving={saving()} />

            <Show when={permOpen()}>
              <Modal onClose={() => setPermOpen(false)} labelledBy={titleId} class="z-[60]">
                <div class="w-full max-w-3xl rounded-2xl bg-surface border border-rim shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

                  <header class="flex items-center gap-3 px-4 py-3 border-b border-rim shrink-0">
                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
                      <MdOutlineShield size={18} />
                    </span>
                    <span class="min-w-0">
                      <h3 id={titleId} class="text-sm font-semibold text-txt">{t("settings.privacy_perm_limits")}</h3>
                      <p class="text-xs text-muted">{t("settings.privacy_perm_limits_desc")}</p>
                    </span>
                  </header>

                  <div class="px-4 py-1.5 overflow-y-auto">
                    <For each={permRows()}>
                      {(perm) => (
                        <div class="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2.5">
                          <span class="flex-1 min-w-0">
                            <span class="block text-sm text-txt">{perm.label}</span>
                            <Show when={perm.help}>
                              <span class="block text-xs text-muted">{perm.help}</span>
                            </Show>
                          </span>
                          <select
                            class="w-full sm:w-60 shrink-0 px-2.5 py-1.5 rounded-lg border border-rim
                                   bg-base text-txt text-sm hover:border-rim-strong focus:outline-none
                                   focus:border-rim-strong transition-colors"
                            onChange={(e) =>
                              setPermOverrides({ ...permOverrides(), [perm.key]: Number(e.currentTarget.value) })
                            }
                          >
                            <For each={Object.entries(perm.options)}>
                              {([val, label]) => (
                                <option value={val} selected={Number(val) === perm.value}>
                                  {label}
                                </option>
                              )}
                            </For>
                          </select>
                        </div>
                      )}
                    </For>
                    <div class="flex items-center justify-between gap-4 py-2.5 border-t border-rim">
                      <span class="block text-sm text-txt">{t("settings.privacy_group_actor")}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!gaVal()}
                        onClick={() => setGaOverride(gaVal() ? 0 : 1)}
                        class={
                          "appearance-none relative h-6 w-11 shrink-0 cursor-pointer rounded-full p-0 " +
                          "border transition-colors " +
                          "after:absolute after:top-1/2 after:left-1 after:-translate-y-1/2 " +
                          "after:h-4 after:w-4 after:rounded-full " +
                          "after:transition-transform after:duration-150 motion-reduce:after:transition-none " +
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 " +
                          "focus-visible:ring-offset-2 focus-visible:ring-offset-surface " +
                          (gaVal()
                            ? "bg-accent border-accent after:translate-x-5 after:bg-accent-fg"
                            : "bg-elevated border-rim after:bg-muted")
                        }
                      />
                    </div>
                  </div>

                  <footer class="flex items-center justify-between gap-4 px-4 py-3 border-t border-rim shrink-0">
                    <p class="text-xs text-muted">{t("settings.channel_perm_limits_note")}</p>
                    <button
                      type="button"
                      onClick={() => setPermOpen(false)}
                      class="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-fg
                             hover:opacity-90 transition-opacity"
                    >
                      {t("settings.channel_perm_limits_done")}
                    </button>
                  </footer>

                </div>
              </Modal>
            </Show>

          </form>
        )}
      </Show>
    </SubPageContent>
  );
}

function Skeleton() {
  return (
    <div class="space-y-5 animate-pulse">
      {[...Array(3)].map(() => (
        <div class="rounded-xl border border-rim bg-surface">
          <div class="flex items-center gap-3 px-4 py-3 border-b border-rim">
            <div class="h-8 w-8 rounded-lg bg-elevated" />
            <div class="space-y-1.5">
              <div class="h-3.5 w-36 rounded bg-elevated" />
              <div class="h-3 w-52 rounded bg-elevated" />
            </div>
          </div>
          <div class="px-4 py-2 space-y-3">
            {[...Array(3)].map(() => (
              <div class="flex items-center justify-between gap-4">
                <div class="h-3.5 w-48 rounded bg-elevated" />
                <div class="h-8 w-40 rounded-lg bg-elevated" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
