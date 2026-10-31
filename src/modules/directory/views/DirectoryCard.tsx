// modules/directory/views/DirectoryCard.tsx
import { Show, For, createSignal, type Component } from "solid-js";
import { addConnection, censorEntry, chanviewHref, type DirectoryEntry } from "../people/api";
import { isDirectoryAdmin, setEntryCensored } from "../people/store";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillCheck, MdOutlineBlock, MdOutlineForum, MdOutlinePlace, MdOutlineReport, MdOutlineWarning_amber } from "solid-icons/md";
import { Button, buttonClass, iconButtonClass } from "@ui/Button";
import { Menu, MenuItem } from "@ui/Menu";
import { Card } from "@ui/Card";
import { Badge } from "@ui/Badge";
import { Avatar } from "@ui/Avatar";
import { Skeleton, SkeletonText } from "@ui/Skeleton";

interface Props {
  entry: DirectoryEntry;
  onSelect: (entry: DirectoryEntry) => void;
}

const DirectoryCard: Component<Props> = (props) => {
  const { t } = useI18n();
  const e = () => props.entry;
  const blurb = () => e().description || stripTags(e().about);
  const [connectState, setConnectState] = createSignal<"idle" | "pending" | "done">("idle");
  const [censoring, setCensoring] = createSignal(false);
  async function handleAdd() {
    if (connectState() !== "idle") return;
    setConnectState("pending");
    try {
      await addConnection(props.entry.address);
      setConnectState("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Follow failed");
      setConnectState("idle");
    }
  }

  async function handleCensor(severity: 0 | 1 | 2) {
    if (censoring()) return;
    setCensoring(true);
    const prev = e().censored;
    try {
      await censorEntry(e().hash, severity);
      setEntryCensored(e().hash, severity);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Censor failed");
      setEntryCensored(e().hash, prev);
    } finally {
      setCensoring(false);
    }
  }
  return (
    <Card class="flex flex-col overflow-hidden hover:border-rim-strong transition-colors cursor-pointer group"
      onClick={() => props.onSelect(e())}>
      {/* ── Avatar + identity ── */}
      <div class="flex items-center gap-3 p-4 pb-3">
        <Avatar src={e().photo} name={e().name} size={11} />
        <div class="min-w-0 flex-1">
          {/* The button is the keyboard path to the detail; the card click
              is the pointer shortcut for the same thing. */}
          <button
            type="button"
            class="block max-w-full font-semibold text-sm text-txt truncate text-left group-hover:text-accent-txt transition-colors"
            onClick={(ev) => { ev.stopPropagation(); props.onSelect(e()); }}
          >
            {e().name}
          </button>
          <p class="text-xs text-muted truncate mt-0.5">{e().address}</p>
        </div>
      </div>

      {/* ── Blurb + meta ── */}
      <div class="flex-1 px-4 pb-3 space-y-2">
        <Show when={e().public_forum || (e().common_count ?? 0) > 0}>
          <div class="flex flex-wrap items-center gap-1.5">
            <Show when={e().public_forum}>
              <Badge tone="accent" size="sm"><MdOutlineForum size={12} /> {t("directory.public_forum")}</Badge>
            </Show>
            <Show when={(e().common_count ?? 0) > 0}>
              <span class="text-xs text-accent-txt tabular-nums">
                {e().common_count} {(e().common_count ?? 0) === 1 ? t("directory.mutual") : t("directory.mutuals")}
              </span>
            </Show>
          </div>
        </Show>
        <Show when={blurb()}>
          <p class="text-xs text-muted line-clamp-2 leading-relaxed">{blurb()}</p>
        </Show>
        <Show when={e().location}>
          <p class="text-xs text-muted truncate flex items-center gap-1">
            <MdOutlinePlace size={13} class="shrink-0" />
            {e().location}
          </p>
        </Show>
        <Show when={e().keywords.length > 0}>
          <div class="flex flex-wrap gap-1">
            <For each={e().keywords.slice(0, 4)}>
              {(kw) => <Badge size="sm">{kw}</Badge>}
            </For>
          </div>
        </Show>
      </div>

      {/* ── Actions — stopPropagation so they don't open the detail. ── */}
      <div
        class="flex items-center gap-2 px-4 py-3 border-t border-rim mt-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        <Show
          when={!e().is_connected && connectState() !== "done"}
          fallback={
            <span class="flex-1 inline-flex items-center justify-center gap-1.5 h-8 text-xs font-medium text-success-txt">
              <MdFillCheck size={15} /> {t("directory.connected")}
            </span>
          }
        >
          <Show
            when={e().connect_url}
            fallback={
              <a href={chanviewHref(e())} class={`${buttonClass("ghost", "sm")} flex-1`}>
                {t("directory.view_profile")}
              </a>
            }
          >
            <Button size="sm" class="flex-1" onClick={handleAdd} disabled={connectState() === "pending"}>
              {t("directory.connect")}
            </Button>
          </Show>
        </Show>
        <Show when={e().ignore_url && !e().is_connected}>
          <a
            href={e().ignore_url!}
            title={t("directory.ignore")}
            aria-label={t("directory.ignore")}
            class={iconButtonClass("outline")}
          >
            <MdOutlineBlock size={15} />
          </a>
        </Show>
        {/* Site admins: the dircensor-style moderation flags. */}
        <Show when={isDirectoryAdmin()}>
          <Menu label={t("directory.more_actions")} placement="top-end" class="w-44">
            <MenuItem
              danger
              icon={<MdOutlineWarning_amber size={16} />}
              disabled={censoring()}
              onClick={() => handleCensor(e().censored === 1 ? 0 : 1)}
            >
              {e().censored === 1 ? `✓ ${t("directory.unsafe")}` : t("directory.mark_unsafe")}
            </MenuItem>
            <MenuItem
              danger
              icon={<MdOutlineReport size={16} />}
              disabled={censoring()}
              onClick={() => handleCensor(e().censored > 1 ? 0 : 2)}
            >
              {e().censored > 1 ? `✓ ${t("directory.spam")}` : t("directory.mark_spam")}
            </MenuItem>
          </Menu>
        </Show>
      </div>
    </Card>
  );
};

export default DirectoryCard;

export function CardSkeleton() {
  return (
    <div class="rounded-xl border border-rim bg-surface p-4 space-y-3">
      <div class="flex items-center gap-3">
        <Skeleton rounded="full" tone="overlay" class="w-12 h-12" />
        <div class="flex-1 space-y-2">
          <Skeleton tone="overlay" class="h-4 w-3/4" />
          <Skeleton tone="overlay" class="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={2} tone="overlay" />
    </div>
  );
}


function stripTags(html: string): string {
  // DOMParser documents are inert (no scripts, no image loads); textContent also decodes &amp; etc.
  return (new DOMParser().parseFromString(html.replace(/<[^>]+>/g, " $& "), "text/html").body.textContent ?? "").replace(/\s+/g, " ").trim();
}
