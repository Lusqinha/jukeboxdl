/** Gradiente da marca, do ciano ao magenta. */
export const GRADIENT = ["#00d7ff", "#00afff", "#5f87ff", "#875fff", "#af5fff", "#d75fd7"] as const;

export const ACCENT = "cyan";
export const SELECTION_BG = "#1f2a3a";

export function gradientAt(position: number): string {
  const n = GRADIENT.length;
  const i = ((Math.floor(position) % n) + n) % n;
  return GRADIENT[i] as string;
}
