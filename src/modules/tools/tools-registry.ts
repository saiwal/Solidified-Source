import { lazy, type Component } from "solid-js";
import type * as i18n from "@solid-primitives/i18n";
import type { RawDictionary } from "@utsukta/spa-core/i18n/locales/namespaces/types";
import {
  MdOutlineCalculate,
  MdOutlineQr_code_2,
  MdOutlineStraighten,
  MdOutlineData_object,
  MdOutlineKey,
  MdFillImage,
  MdOutlineMovie,
  MdOutlineBrush,
} from "solid-icons/md";

type TranslatorKey = keyof i18n.Flatten<RawDictionary>;

export type ToolId =
  | "calculator"
  | "qr"
  | "unit-converter"
  | "base64"
  | "password"
  | "image-editor"
  | "video-editor"
  | "excalidraw";

export type ToolEntry = {
  id: ToolId;
  labelKey: TranslatorKey;
  icon: Component<{ class?: string }>;
  component: Component;
  /** Frontend-module id gating this entry (see isModuleActive) — absent = always shown. */
  moduleId?: string;
};

export const TOOLS: ToolEntry[] = [
  { id: "calculator",     labelKey: "tools.calc",     icon: MdOutlineCalculate,   component: lazy(() => import("./components/Calculator").then(m => ({ default: m.Calculator }))) },
  { id: "qr",             labelKey: "tools.qr",       icon: MdOutlineQr_code_2,   component: lazy(() => import("./components/QRGenerator").then(m => ({ default: m.QRGenerator }))) },
  { id: "unit-converter", labelKey: "tools.unit",     icon: MdOutlineStraighten,  component: lazy(() => import("./components/UnitConverter").then(m => ({ default: m.UnitConverter }))) },
  { id: "base64",         labelKey: "tools.base64",   icon: MdOutlineData_object, component: lazy(() => import("./components/Base64Tool").then(m => ({ default: m.Base64Tool }))) },
  { id: "password",       labelKey: "tools.password", icon: MdOutlineKey,         component: lazy(() => import("./components/PasswordGenerator").then(m => ({ default: m.PasswordGenerator }))) },
  { id: "image-editor",   labelKey: "tools.img",      icon: MdFillImage,          component: lazy(() => import("./components/ImageEditor").then(m => ({ default: m.ImageEditor }))) },
  { id: "video-editor",   labelKey: "tools.vid",      icon: MdOutlineMovie,       component: lazy(() => import("./components/VideoEditor").then(m => ({ default: m.VideoEditor }))) },
  { id: "excalidraw",     labelKey: "tools.excalidraw", icon: MdOutlineBrush,     component: lazy(() => import("./components/ExcalidrawTool").then(m => ({ default: m.ExcalidrawTool }))), moduleId: "excalidraw" },
];
