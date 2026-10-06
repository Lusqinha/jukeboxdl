import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "../config/schema";
import { type AppPaths, getAppPaths } from "../paths";
import { detectBinary } from "./detect";
import { latestYtDlpVersion } from "./install";

export interface YtDlpUpdateStatus {
  current: string | null;
  latest: string;
  managed: boolean;
  outdated: boolean;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Compara a versão do yt-dlp em uso com a mais recente. A consulta à rede acontece no
 * máximo uma vez por dia (resultado guardado na pasta de dados).
 */
export async function checkYtDlpUpdate({
  binaries = {},
  paths = getAppPaths(),
  fetch: fetchImpl = fetch,
  force = false,
}: {
  binaries?: Config["binaries"];
  paths?: AppPaths;
  fetch?: typeof fetch;
  force?: boolean;
} = {}): Promise<YtDlpUpdateStatus | null> {
  const info = await detectBinary("yt-dlp", { binaries, paths }).catch(() => null);
  if (!info) return null;

  const cacheFile = join(paths.data, "update-check.json");
  let latest: string | undefined;
  try {
    const cache = JSON.parse(await readFile(cacheFile, "utf8")) as {
      checkedAt: number;
      latest: string;
    };
    if (!force && Date.now() - cache.checkedAt < CHECK_INTERVAL_MS) latest = cache.latest;
  } catch {
    // Sem cache: consulta a rede.
  }
  if (!latest) {
    latest = await latestYtDlpVersion(fetchImpl, AbortSignal.timeout(8000));
    await mkdir(paths.data, { recursive: true });
    await writeFile(cacheFile, JSON.stringify({ checkedAt: Date.now(), latest }));
  }

  // As versões do yt-dlp são datas (2026.08.19), então comparar texto basta.
  const outdated = info.version !== null && info.version.localeCompare(latest) < 0;
  return { current: info.version, latest, managed: info.source === "managed", outdated };
}
