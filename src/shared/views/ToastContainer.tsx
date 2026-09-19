import { For, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { toasts, dismiss, type Toast, type ToastType } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineCheck, MdOutlineClose } from "solid-icons/md";

// ── Icons ─────────────────────────────────────────────────────────────────────

function ToastIcon(props: { type: ToastType }) {
  if (props.type === "success") {
    return (
      <MdOutlineCheck class="w-4 h-4 shrink-0" />
    );
  }
  if (props.type === "warning") {
    return (
      <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
      </svg>
    );
  }
  if (props.type === "error") {
    return (
      <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
      </svg>
    );
  }
  // info
  return (
    <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
    </svg>
  );
}

// ── Colour map ────────────────────────────────────────────────────────────────

const styles: Record<ToastType, { bar: string; icon: string; bg: string; border: string; text: string }> = {
  error: {
    bar:    "bg-red-500",
    icon:   "text-red-500",
    bg:     "bg-surface",
    border: "border-rim",
    text:   "text-txt",
  },
  success: {
    bar:    "bg-green-500",
    icon:   "text-green-500",
    bg:     "bg-surface",
    border: "border-rim",
    text:   "text-txt",
  },
  info: {
    bar:    "bg-accent",
    icon:   "text-accent",
    bg:     "bg-surface",
    border: "border-rim",
    text:   "text-txt",
  },
  warning: {
    bar:    "bg-amber-500",
    icon:   "text-amber-500",
    bg:     "bg-surface",
    border: "border-rim",
    text:   "text-txt",
  },
};

// ── Single toast ──────────────────────────────────────────────────────────────

function ToastItem(props: { toast: Toast }) {
  const { t } = useI18n();
  const s = styles[props.toast.type];
  const clickable = !!props.toast.onClick;
  return (
    <div
      role="alert"
      aria-live="assertive"
      onClick={clickable ? () => props.toast.onClick!() : undefined}
      class={`
        flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)]
        rounded-xl border shadow-lg overflow-hidden
        ${s.bg} ${s.border}
        animate-[toast-in_0.2s_ease-out]
        ${clickable ? "cursor-pointer hover:bg-elevated transition-colors" : ""}
      `}
    >
      {/* Colour stripe */}
      <div class={`w-1 self-stretch shrink-0 ${s.bar}`} />

      {/* Icon + message */}
      <div class={`flex items-start gap-2.5 flex-1 py-3 pr-1 min-w-0 ${s.icon}`}>
        <span class="mt-0.5"><ToastIcon type={props.toast.type} /></span>
        <p class={`text-sm leading-snug break-words flex-1 ${s.text}`}>
          {props.toast.message}
        </p>
      </div>

      {/* Dismiss */}
      <button
        onClick={(e) => { e.stopPropagation(); dismiss(props.toast.id); }}
        aria-label={t("ui.dismiss_notification")}
        class="mt-2.5 mr-2.5 shrink-0 p-0.5 rounded text-muted hover:text-txt
               hover:bg-elevated transition-colors"
      >
        <MdOutlineClose class="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────

const ToastContainer: Component = () => {
  const { t } = useI18n();
  return (
    <Portal mount={document.body}>
      <div
        role="region"
        aria-label={t("ui.notifications")}
        aria-live="polite"
        class="fixed z-[9999] flex flex-col gap-2 pointer-events-none
               bottom-21 right-4
               xl:bottom-6 xl:right-6"
      >
        <For each={toasts()}>
          {(toast) => (
            <div class="pointer-events-auto">
              <ToastItem toast={toast} />
            </div>
          )}
        </For>
      </div>
    </Portal>
  );
};

export default ToastContainer;
