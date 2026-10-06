import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, stat, statfs, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { basename, dirname, join } from "node:path";
import { type AppPaths, expandHome, getAppPaths } from "../paths";

export interface Destination {
  path: string;
  label: string;
  /** Bytes livres, quando foi possível medir. */
  free?: number | undefined;
}

async function freeSpace(path: string): Promise<number | undefined> {
  try {
    const info = await statfs(path);
    return info.bavail * info.bsize;
  } catch {
    return undefined;
  }
}

async function subdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

/** Pontos de montagem de discos externos e pendrives (Linux e macOS). */
export async function listRemovableDrives(): Promise<Destination[]> {
  let candidates: string[] = [];
  if (process.platform === "darwin") {
    candidates = (await subdirectories("/Volumes")).filter(
      (path) => basename(path) !== "Macintosh HD",
    );
  } else if (process.platform === "linux") {
    const user = userInfo().username;
    candidates = [
      ...(await subdirectories(`/run/media/${user}`)),
      ...(await subdirectories(`/media/${user}`)),
      ...(await subdirectories("/media")).filter((path) => basename(path) !== user),
      ...(await subdirectories("/mnt")),
    ];
  }
  const unique = [...new Set(candidates)];
  return Promise.all(
    unique.map(async (path) => ({ path, label: basename(path), free: await freeSpace(path) })),
  );
}

/**
 * Confere se dá para gravar no destino: a pasta existe e aceita escrita, ou a pasta-mãe
 * existe e aceita escrita (aí ela é criada no primeiro download).
 */
export async function checkDestination(
  path: string,
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  const target = expandHome(path.trim());
  if (!target) return { ok: false, reason: "empty" };
  for (const candidate of [target, dirname(target)]) {
    try {
      if (!(await stat(candidate)).isDirectory()) return { ok: false, reason: "not-a-directory" };
      await access(candidate, constants.W_OK);
      return { ok: true, path: target };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EACCES")
        return { ok: false, reason: "not-writable" };
    }
  }
  return { ok: false, reason: "not-found" };
}

export async function describeDestination(path: string, label?: string): Promise<Destination> {
  return { path, label: label ?? basename(path), free: await freeSpace(path) };
}

const RECENT_LIMIT = 5;

export async function loadRecentDestinations(paths: AppPaths = getAppPaths()): Promise<string[]> {
  try {
    const data = JSON.parse(
      await readFile(join(paths.data, "destinations.json"), "utf8"),
    ) as unknown;
    return Array.isArray(data)
      ? data.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function rememberDestination(
  path: string,
  paths: AppPaths = getAppPaths(),
): Promise<void> {
  const recent = [
    path,
    ...(await loadRecentDestinations(paths)).filter((item) => item !== path),
  ].slice(0, RECENT_LIMIT);
  await mkdir(paths.data, { recursive: true });
  await writeFile(join(paths.data, "destinations.json"), JSON.stringify(recent));
}
