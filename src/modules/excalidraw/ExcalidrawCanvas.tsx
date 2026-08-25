/**
 * ExcalidrawCanvas.tsx
 * Solid component that mounts the React-based @excalidraw/excalidraw canvas
 * into a plain div. This is the one place React is mounted for this feature —
 * everything above it (the tools subsection, the editor modal) is Solid.
 */
import { createSignal, onCleanup, onMount, type Component } from "solid-js";
import { createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Excalidraw,
  exportToBlob,
  serializeAsJSON,
  loadFromBlob,
  useHandleLibrary,
} from "@excalidraw/excalidraw";
import { cloudLibraryAdapter } from "./library-store";
import "@excalidraw/excalidraw/index.css";

export interface ExcalidrawExport {
  /** Flat PNG with the scene embedded, so the exported image reopens as a drawing. */
  toPngFile(filename?: string): Promise<File>;
  /** The scene itself, as an .excalidraw (JSON) file. */
  toSceneFile(filename?: string): Promise<File>;
  /** Replace the canvas with a scene read from an .excalidraw file or a scene-embedded PNG. */
  loadScene(blob: Blob): Promise<void>;
}

interface Props {
  onReady?: (api: ExcalidrawExport) => void;
  /** Strip Excalidraw's own save/export/library chrome (used inside the composer). */
  minimal?: boolean;
  /** Read-only canvas — for previewing a stored scene. */
  viewMode?: boolean;
}

function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

// Excalidraw's own menu entries duplicate — and in the composer, compete with —
// the surrounding UI's Insert / Save to cloud / Open buttons.
const MINIMAL_UI = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false as const,
    saveAsImage: false,
    toggleTheme: false,
  },
};

// useHandleLibrary is a React hook, so it needs a React component to live in:
// it owns loading/saving library items through the adapter and handles the
// "#addLibrary=…" return from libraries.excalidraw.com. Without it the library
// sidebar accepts shapes but never persists or imports anything.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExcalidrawWithLibrary(props: { excalidrawProps: any; onApi: (api: any) => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [api, setApi] = useState<any>(null);
  useHandleLibrary({ excalidrawAPI: api, adapter: cloudLibraryAdapter() });
  return createElement(Excalidraw, {
    ...props.excalidrawProps,
    // Where libraries.excalidraw.com sends the user back to; the package strips
    // its own #addLibrary hash afterwards, so pass a clean URL.
    libraryReturnUrl: window.location.origin + window.location.pathname,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    excalidrawAPI: (a: any) => {
      setApi(a);
      props.onApi(a);
    },
  });
}

const ExcalidrawCanvas: Component<Props> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let root: Root | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- excalidrawAPI's
  // type lives under the package's internal types entry point; `any` avoids
  // pinning to that unstable path.
  let api: any;
  const [dark, setDark] = createSignal(isDarkMode());

  function requireApi() {
    if (!api) throw new Error("Excalidraw is not ready yet");
    return api;
  }

  function render() {
    if (!root) return;
    root.render(
      createElement(ExcalidrawWithLibrary, {
        excalidrawProps: {
          theme: dark() ? "dark" : "light",
          // Transparent canvas so the wrapper's bg-surface (the active theme's
          // colour) shows through. Passing the theme colour directly doesn't
          // work: Excalidraw's dark mode inverts the canvas with a CSS filter,
          // which would flip a dark background back to light.
          initialData: { appState: { viewBackgroundColor: "transparent" } },
          ...(props.minimal || props.viewMode ? { UIOptions: MINIMAL_UI } : {}),
          ...(props.viewMode ? { viewModeEnabled: true } : {}),
        },
        onApi: (a: any) => {
          api = a;
          props.onReady?.({
            async toPngFile(filename = "drawing.png") {
              const ex = requireApi();
              const blob = await exportToBlob({
                elements: ex.getSceneElements(),
                // exportEmbedScene stores the scene inside the PNG, so a posted
                // drawing can be reopened and edited instead of being a dead image.
                appState: { ...ex.getAppState(), exportEmbedScene: true },
                files: ex.getFiles(),
                mimeType: "image/png",
              });
              return new File([blob], filename, { type: "image/png" });
            },
            async toSceneFile(filename = "drawing.excalidraw") {
              const ex = requireApi();
              const json = serializeAsJSON(
                ex.getSceneElements(),
                ex.getAppState(),
                ex.getFiles(),
                "local",
              );
              return new File([json], filename, { type: "application/json" });
            },
            async loadScene(blob: Blob) {
              const ex = requireApi();
              // Throws on anything that isn't a scene — that is the validation.
              const scene = await loadFromBlob(blob, null, null);
              if (scene.files) ex.addFiles(Object.values(scene.files));
              ex.updateScene({
                elements: scene.elements,
                appState: { ...scene.appState, collaborators: new Map() },
              });
              ex.scrollToContent(scene.elements, { fitToContent: true });
            },
          });
        },
      }),
    );
  }

  onMount(() => {
    if (!containerRef) return;
    // The "Browse libraries" link is built as `target=${window.name || "_blank"}`,
    // and libraries.excalidraw.com opens the return URL into that target before
    // closing itself. With no window.name it targets _blank, so the import lands
    // in a brand-new tab instead of coming back to this one. Naming the window
    // (the upstream app uses "excalidraw") makes the round-trip return here.
    if (!window.name) window.name = "excalidraw";
    root = createRoot(containerRef);
    render();

    // Follows the app's own theme toggle (which flips `.dark` on <html>) so the
    // canvas doesn't stay stuck light while the rest of the app is dark.
    const observer = new MutationObserver(() => {
      const next = isDarkMode();
      if (next !== dark()) {
        setDark(next);
        render();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    onCleanup(() => observer.disconnect());
  });

  onCleanup(() => root?.unmount());

  return (
    <div
      ref={containerRef}
      class="w-full h-full min-h-[400px] bg-surface"
      classList={{ "excalidraw-minimal": !!(props.minimal || props.viewMode) }}
    />
  );
};

export default ExcalidrawCanvas;
