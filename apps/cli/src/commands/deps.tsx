import { detectBinaries, getAppPaths, latestYtDlpVersion } from "@jukeboxdl/core";
import { render } from "ink";
import { DepsInstaller, type DepTask } from "../components/DepsInstaller";
import { missingDeps } from "../lib/deps";
import { t } from "../lib/i18n";
import { loadConfigOrFail } from "../lib/session";

async function runInstaller(tasks: DepTask[]): Promise<void> {
  const app = render(
    <DepsInstaller
      tasks={tasks}
      onDone={(ok) => {
        process.exitCode = ok ? 0 : 1;
        setTimeout(() => app.unmount(), 0);
      }}
    />,
  );
  await app.waitUntilExit();
}

export async function depsInstallCommand(options: { force?: boolean }): Promise<void> {
  const config = await loadConfigOrFail();
  const tasks: DepTask[] = options.force
    ? ["yt-dlp", "ffmpeg"]
    : missingDeps(await detectBinaries({ binaries: config.binaries }));
  if (tasks.length === 0) {
    console.log(t("deps.allPresent"));
    return;
  }
  console.log(t("deps.downloadingTo", { path: getAppPaths().bin }));
  await runInstaller(tasks);
}

export async function depsUpdateCommand(): Promise<void> {
  const config = await loadConfigOrFail();
  const report = await detectBinaries({ binaries: config.binaries });
  const ytDlp = report["yt-dlp"];

  if (!ytDlp || ytDlp instanceof Error) {
    console.log(t("deps.missingYtDlp"));
    return runInstaller(["yt-dlp"]);
  }
  if (ytDlp.source !== "managed") {
    console.log(t("deps.notManaged", { path: ytDlp.path }));
    return;
  }

  const latest = await latestYtDlpVersion();
  if (latest === ytDlp.version) {
    console.log(t("deps.upToDate", { version: latest }));
    return;
  }
  console.log(t("deps.updating", { from: ytDlp.version ?? "?", to: latest }));
  await runInstaller(["yt-dlp"]);
}
