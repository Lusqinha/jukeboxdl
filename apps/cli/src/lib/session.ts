import {
  BinaryError,
  type Config,
  ConfigError,
  getAppPaths,
  Jukebox,
  loadConfig,
} from "@jukeboxdl/core";

export function fail(message: string): never {
  process.stderr.write(`\x1b[31m✖\x1b[0m ${message}\n`);
  process.exit(1);
}

export async function loadConfigOrFail(): Promise<Config> {
  try {
    return await loadConfig(getAppPaths().configFile);
  } catch (error) {
    if (error instanceof ConfigError) fail(error.message);
    throw error;
  }
}

/** Abre o Jukebox ou encerra com uma mensagem amigável. */
export async function openJukebox(config?: Config): Promise<Jukebox> {
  try {
    return await Jukebox.create({ config: config ?? (await loadConfigOrFail()) });
  } catch (error) {
    if (error instanceof BinaryError) fail(error.message);
    throw error;
  }
}
