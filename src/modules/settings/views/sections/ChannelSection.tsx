import { Show, For, createSignal, createUniqueId } from "solid-js";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchChannelSettings, saveChannelSettings } from "../../api/api";
import { useSectionForm } from "../../store/useSectionForm";
import { SaveBar, Group } from "../../store/FormHelpers";
import { useI18n } from "@utsukta/spa-core/i18n";
import FilterRuleBuilder from "@/shared/views/FilterRuleBuilder";
import { MdOutlineFilter_alt, MdOutlineManage_accounts, MdOutlineShield, MdOutlineTune } from "solid-icons/md";

import { Modal, ModalPanel } from "@ui/Modal";
import { Button } from "@ui/Button";
import { Field, Input, Select } from "@ui/Field";
import { Toggle } from "@ui/Toggle";
import { Card, CardHeader } from "@ui/Card";
interface PermRow {
  key: string;
  label: string;
  value: number;
  help: string;
  options: Record<string, string>;
}

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
                  <Select
                    class="w-full"
                    name="permissions_role"
                    required
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
                  </Select>
                </Field>
              </div>
              <Show when={effRole() === "custom"}>
                <div class="flex items-center justify-between gap-4 py-2.5">
                  <span class="min-w-0">
                    <span class="block text-sm text-txt">{t("settings.privacy_perm_limits")}</span>
                    <span class="block text-xs text-muted">{t("settings.privacy_perm_limits_desc")}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setPermOpen(true)}>
                    {t("settings.channel_perm_limits_open")}
                  </Button>
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
                  <Select class="w-full" name="timezone">
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
                  </Select>
                </Field>
                <Field label={t("settings.channel_defloc")} hint={t("settings.channel_defloc_hint")}>
                  <Input class="w-full" type="text" name="defloc" value={d().defloc} />
                </Field>
              </div>
              <Toggle name="allow_location" label={t("settings.channel_allow_location")} checked={!!d().allow_location} />
              <Toggle name="adult" label={t("settings.channel_adult")} hint={t("settings.channel_adult_hint")} checked={!!d().adult} />
              <div class="flex items-center justify-between gap-4 py-2.5">
                <span class="min-w-0">
                  <span class="block text-sm text-txt">{t("settings.channel_maxreq")}</span>
                  <span class="block text-xs text-muted">{t("settings.channel_maxreq_hint")}</span>
                </span>
                <Input
                  class="w-16 shrink-0 text-center"
                  type="number"
                  name="maxreq"
                  min="0"
                  value={d().maxreq}
                />
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
                  <Input class="w-full" type="text" name="photo_path" value={d().photo_path} />
                </Field>
                <Field label={t("settings.channel_attach_path")} hint={t("settings.channel_path_hint")}>
                  <Input class="w-full" type="text" name="attach_path" value={d().attach_path} />
                </Field>
                <div class="flex items-center justify-between gap-4">
                  <span class="min-w-0">
                    <span class="block text-sm text-txt">{t("settings.channel_expire")}</span>
                    <span class="block text-xs text-muted">{expireHint()}</span>
                  </span>
                  <Input
                    class="w-16 shrink-0 text-center"
                    type="number"
                    name="expire"
                    min="0"
                    value={d().expire}
                  />
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
                <ModalPanel class="max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">

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
                          <Select class="w-full shrink-0" onChange={(e) =>
                              setPermOverrides({ ...permOverrides(), [perm.key]: Number(e.currentTarget.value) })
                            }>
                            <For each={Object.entries(perm.options)}>
                              {([val, label]) => (
                                <option value={val} selected={Number(val) === perm.value}>
                                  {label}
                                </option>
                              )}
                            </For>
                          </Select>
                        </div>
                      )}
                    </For>
                    <Toggle
                      class="border-t border-rim"
                      label={t("settings.privacy_group_actor")}
                      checked={!!gaVal()}
                      onChange={(on) => void setGaOverride(on ? 1 : 0)}
                    />
                  </div>

                  <footer class="flex items-center justify-between gap-4 px-4 py-3 border-t border-rim shrink-0">
                    <p class="text-xs text-muted">{t("settings.channel_perm_limits_note")}</p>
                    <Button onClick={() => setPermOpen(false)}>
                      {t("settings.channel_perm_limits_done")}
                    </Button>
                  </footer>

                </ModalPanel>
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
        <Card>
          <CardHeader class="flex items-center gap-3">
            <div class="h-8 w-8 rounded-lg bg-elevated" />
            <div class="space-y-1.5">
              <div class="h-3.5 w-36 rounded bg-elevated" />
              <div class="h-3 w-52 rounded bg-elevated" />
            </div>
          </CardHeader>
          <div class="px-4 py-2 space-y-3">
            {[...Array(3)].map(() => (
              <div class="flex items-center justify-between gap-4">
                <div class="h-3.5 w-48 rounded bg-elevated" />
                <div class="h-8 w-40 rounded-lg bg-elevated" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
