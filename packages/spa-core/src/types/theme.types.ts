export const THEMES = [
  { id: "light", label: "Light" },
  { id: "pastel-soft", label: "Pastel Soft" },
  { id: "warm-paper", label: "Warm Paper" },
  { id: "mint", label: "Mint Fresh" },
  { id: "sakura", label: "Sakura" },
  { id: "latte-cream", label: "Latte Cream" },
  { id: "dark", label: "Dark" },
  { id: "nord", label: "Nord" },
  { id: "dracula", label: "Dracula" },
  { id: "monokai", label: "Monokai" },
  { id: "one-dark", label: "One Dark" },
  { id: "cyberpunk", label: "CyberPunk" },
  { id: "rose-pine", label: "Rose Pine" },
  { id: "gruvbox-dark", label: "Gruvbox Dark" },
  { id: "gruvbox-light", label: "Gruvbox Light" },
  { id: "catppuccin-latte", label: "Catppuccin Latte" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha" },
  { id: "solarized-light", label: "Solarized Light" },
  { id: "solarized-dark", label: "Solarized Dark" },
  { id: "tokyo-night", label: "Tokyo Night" },
  { id: "matrix", label: "Matrix" },
  { id: "high-contrast", label: "High Contrast" },
  { id: "high-contrast-light", label: "High Contrast Light" },
  { id: "custom", label: "Custom" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export interface CustomThemeColors {
  base: string;
  txt: string;
  accent: string;
  isDark: boolean;
  /** Optional overrides. Absent = derived from base/txt/accent. */
  surface?: string;
  elevated?: string;
  overlay?: string;
  muted?: string;
  subtle?: string;
  rim?: string;
  rimStrong?: string;
  accentMuted?: string;
  accentTxt?: string;
  accentFg?: string;
  danger?: string;
  dangerMuted?: string;
  dangerTxt?: string;
  dangerFg?: string;
  success?: string;
  successMuted?: string;
  successTxt?: string;
  successFg?: string;
  warning?: string;
  warningMuted?: string;
  warningTxt?: string;
  warningFg?: string;
}
