import { Show } from "solid-js";
import DOMPurify from "dompurify";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useSiteinfo, Section, Centered } from "./shared";
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";

export default function SiteinfoAdminWidget() {
  const { t } = useI18n();
  const info = useSiteinfo();

  return (
    <Show when={info()?.admin_about}>
      {(about) => (
        <Centered>
          <Section title={t("ui.siteinfo_admin")}>
            <div
              class="prose prose-sm dark:prose-invert max-w-none text-txt
                       prose-a:text-accent prose-a:no-underline prose-a:hover:underline"
              innerHTML={DOMPurify.sanitize(bbcodeDisplay(about()))}
            />
          </Section>
        </Centered>
      )}
    </Show>
  );
}
