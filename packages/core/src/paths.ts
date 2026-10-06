import { homedir } from "node:os";
import { join } from "node:path";

export const APP_NAME = "jukeboxdl";

export interface AppPaths {
  /** Diretório de configuração (config.json). */
  config: string;
  /** Diretório de dados (histórico, binários gerenciados). */
  data: string;
  /** Onde ficam o yt-dlp e o ffmpeg baixados pelo próprio app. */
  bin: string;
  configFile: string;
}

export interface PathsContext {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
}

/**
 * Resolve os diretórios do app seguindo as convenções de cada sistema (XDG no Linux).
 * `JUKEBOXDL_HOME` força tudo para um único diretório (modo portátil e testes).
 */
export function getAppPaths({
  env = process.env,
  platform = process.platform,
  home = homedir(),
}: PathsContext = {}): AppPaths {
  let config: string;
  let data: string;

  if (env.JUKEBOXDL_HOME) {
    config = data = env.JUKEBOXDL_HOME;
  } else if (platform === "win32") {
    config = join(env.APPDATA ?? join(home, "AppData", "Roaming"), APP_NAME);
    data = join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), APP_NAME);
  } else if (platform === "darwin" && !env.XDG_CONFIG_HOME) {
    config = data = join(home, "Library", "Application Support", APP_NAME);
  } else {
    config = join(env.XDG_CONFIG_HOME || join(home, ".config"), APP_NAME);
    data = join(env.XDG_DATA_HOME || join(home, ".local", "share"), APP_NAME);
  }

  return { config, data, bin: join(data, "bin"), configFile: join(config, "config.json") };
}

/** Expande `~` no início do caminho para o diretório do usuário. */
export function expandHome(path: string, home = homedir()): string {
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(home, path.slice(2));
  return path;
}
