import type { ThemeName } from "@jukeboxdl/core";
import { createContext, type ReactNode, useContext } from "react";

export interface Theme {
  name: ThemeName;
  /** Ativa os enfeites retrô: painéis chanfrados, títulos //, estrelas, toca-fitas. */
  retro: boolean;
  /** Destaques: aba ativa, títulos //, marcações. */
  accent: string;
  /** Teclas, ponteiro de seleção, abas inativas. */
  link: string;
  /** Avisos e tagline. */
  notice: string;
  /** Metadados: duração, canal, datas, caminhos. */
  meta: string;
  muted: string;
  success: string;
  danger: string;
  warning: string;
  selectionBg: string;
  gradient: readonly string[];
  bevelLight: string;
  bevelDark: string;
  barFilled: string;
  barEmpty: string;
}

export const THEMES: Record<ThemeName, Theme> = {
  neon: {
    name: "neon",
    retro: true,
    accent: "#ff4fd8",
    link: "#5fd7ff",
    notice: "#ffe14d",
    meta: "#39ff6a",
    muted: "#7a7a99",
    success: "#39ff6a",
    danger: "#ff5f87",
    warning: "#ffe14d",
    selectionBg: "#2b0f3a",
    gradient: ["#ff4fd8", "#d65cff", "#a070ff", "#6f8cff", "#3fd0ff", "#3ee6ff"],
    bevelLight: "#d7d7e7",
    bevelDark: "#4a4a60",
    barFilled: "▰",
    barEmpty: "▱",
  },
  classico: {
    name: "classico",
    retro: false,
    accent: "cyan",
    link: "cyan",
    notice: "yellow",
    meta: "gray",
    muted: "gray",
    success: "green",
    danger: "red",
    warning: "yellow",
    selectionBg: "#1f2a3a",
    gradient: ["#00d7ff", "#00afff", "#5f87ff", "#875fff", "#af5fff", "#d75fd7"],
    bevelLight: "gray",
    bevelDark: "gray",
    barFilled: "█",
    barEmpty: "░",
  },
};

const ThemeContext = createContext<Theme>(THEMES.neon);

export function ThemeProvider({ name, children }: { name: ThemeName; children: ReactNode }) {
  return <ThemeContext.Provider value={THEMES[name]}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Cor cíclica do gradiente (para animações que "correm"). */
export function gradientAt(theme: Theme, position: number): string {
  const n = theme.gradient.length;
  const i = ((Math.floor(position) % n) + n) % n;
  return theme.gradient[i] as string;
}

/** Cor do gradiente espelhado (início → fim → início) ao longo de `total` colunas. */
export function mirroredGradient(theme: Theme, index: number, total: number): string {
  const n = theme.gradient.length;
  const t = total <= 1 ? 0 : index / (total - 1);
  const position = Math.round((1 - Math.abs(2 * t - 1)) * (n - 1));
  return theme.gradient[position] as string;
}

export interface ColorRun {
  start: number;
  text: string;
  color: string | undefined;
}

/** Agrupa caracteres consecutivos de mesma cor (menos nós de texto para o Ink). */
export function colorRuns(
  length: number,
  at: (i: number) => { char: string; color: string | undefined },
): ColorRun[] {
  const runs: ColorRun[] = [];
  for (let i = 0; i < length; i++) {
    const { char, color } = at(i);
    const last = runs.at(-1);
    if (last && last.color === color) last.text += char;
    else runs.push({ start: i, text: char, color });
  }
  return runs;
}

/** [0, 1, …, n-1] — para listas de posições fixas (linhas, colunas, barras). */
export const range = (n: number): number[] => Array.from({ length: Math.max(0, n) }, (_, i) => i);
