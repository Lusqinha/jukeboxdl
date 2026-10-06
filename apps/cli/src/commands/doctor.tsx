import {
  BINARY_NAMES,
  ConfigError,
  DEFAULT_CONFIG,
  detectBinaries,
  getAppPaths,
  loadConfig,
} from "@jukeboxdl/core";
import { render } from "ink";
import { Doctor } from "../components/Doctor";

export async function doctorCommand(): Promise<void> {
  const paths = getAppPaths();
  let config = DEFAULT_CONFIG;
  let configError: string | null = null;
  try {
    config = await loadConfig(paths.configFile);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    configError = error.issues.length > 0 ? error.issues.join("\n") : error.message;
  }

  const binaries = await detectBinaries({ binaries: config.binaries, paths });
  const healthy =
    !configError &&
    BINARY_NAMES.every((name) => binaries[name] && !(binaries[name] instanceof Error));

  const { unmount } = render(
    <Doctor
      configFile={paths.configFile}
      configError={configError}
      binDir={paths.bin}
      binaries={binaries}
    />,
  );
  unmount();
  process.exitCode = healthy ? 0 : 1;
}
