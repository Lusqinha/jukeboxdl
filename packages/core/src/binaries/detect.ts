import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Config } from "../config/schema";
import { BinaryError } from "../errors";
import { type AppPaths, expandHome, getAppPaths } from "../paths";
import { type BinaryName, executableName } from "./platform";
import { isExecutable, which } from "./which";

const execFileAsync = promisify(execFile);

export const BINARY_NAMES: readonly BinaryName[] = ["yt-dlp", "ffmpeg", "ffprobe"];

export type BinarySource = "config" | "managed" | "system";

export interface BinaryInfo {
  name: BinaryName;
  path: string;
  version: string | null;
  source: BinarySource;
}

export interface DetectOptions {
  binaries?: Config["binaries"];
  paths?: AppPaths;
  env?: NodeJS.ProcessEnv;
}

function configuredPath(name: BinaryName, binaries: Config["binaries"]): string | undefined {
  if (name === "yt-dlp") return binaries.ytDlp;
  if (!binaries.ffmpeg) return undefined;
  const ffmpeg = expandHome(binaries.ffmpeg);
  return name === "ffmpeg" ? ffmpeg : join(dirname(ffmpeg), executableName("ffprobe"));
}

export async function readVersion(name: BinaryName, path: string): Promise<string | null> {
  try {
    const args = name === "yt-dlp" ? ["--version"] : ["-version"];
    const { stdout } = await execFileAsync(path, args, { timeout: 15_000 });
    if (name === "yt-dlp") return stdout.trim() || null;
    return /version\s+(\S+)/.exec(stdout)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Localiza um binário nesta ordem: caminho da config → binário gerenciado pelo app → PATH.
 * Um caminho configurado que não existe é erro, para não usar outro binário em silêncio.
 */
export async function detectBinary(
  name: BinaryName,
  { binaries = {}, paths = getAppPaths(), env = process.env }: DetectOptions = {},
): Promise<BinaryInfo | null> {
  const configured = configuredPath(name, binaries);
  if (configured) {
    const path = expandHome(configured);
    if (!(await isExecutable(path))) {
      throw new BinaryError(`O caminho configurado para o ${name} não é um executável: ${path}`);
    }
    return { name, path, source: "config", version: await readVersion(name, path) };
  }

  const managed = join(paths.bin, executableName(name));
  if (await isExecutable(managed)) {
    return { name, path: managed, source: "managed", version: await readVersion(name, managed) };
  }

  const system = await which(name, env);
  if (system) {
    return { name, path: system, source: "system", version: await readVersion(name, system) };
  }

  return null;
}

export type BinaryReport = Record<BinaryName, BinaryInfo | BinaryError | null>;

/** Detecta todos os binários; erros de cada um ficam no relatório em vez de interromper. */
export async function detectBinaries(options: DetectOptions = {}): Promise<BinaryReport> {
  const entries = await Promise.all(
    BINARY_NAMES.map(async (name) => {
      try {
        return [name, await detectBinary(name, options)] as const;
      } catch (error) {
        if (error instanceof BinaryError) return [name, error] as const;
        throw error;
      }
    }),
  );
  return Object.fromEntries(entries) as BinaryReport;
}
