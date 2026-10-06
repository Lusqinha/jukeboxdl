export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "--:--";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export const isUrl = (input: string) => /^https?:\/\//i.test(input.trim());

/** "1-3,7" → {1,2,3,7}. */
export function parseItems(spec: string): Set<number> {
  const items = new Set<number>();
  for (const part of spec.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
    if (!match) throw new Error(`Intervalo inválido: "${part}" (use algo como 1-5,8)`);
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) items.add(i);
  }
  return items;
}

/** Id do vídeo no parâmetro `v` de um link com playlist (`watch?v=…&list=…`). */
export function videoIdFromUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get("v") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Remove seletores de variação e joiners de emoji, que fazem terminal e Ink discordarem
 * da largura do texto e desalinham as colunas.
 */
export function displayText(text: string): string {
  return text.replace(/[\uFE0E\uFE0F\u200D]/g, "");
}
