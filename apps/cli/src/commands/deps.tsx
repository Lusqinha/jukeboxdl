import { detectBinaries, getAppPaths, latestYtDlpVersion } from "@jukeboxdl/core";
import { render } from "ink";
import { DepsInstaller, type DepTask } from "../components/DepsInstaller";
import { missingDeps } from "../lib/deps";
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
    console.log(
      "✔ Todas as dependências já estão disponíveis (use --force para baixar mesmo assim).",
    );
    return;
  }
  console.log(`Baixando para ${getAppPaths().bin}`);
  await runInstaller(tasks);
}

export async function depsUpdateCommand(): Promise<void> {
  const config = await loadConfigOrFail();
  const report = await detectBinaries({ binaries: config.binaries });
  const ytDlp = report["yt-dlp"];

  if (!ytDlp || ytDlp instanceof Error) {
    console.log("yt-dlp não está instalado; baixando…");
    return runInstaller(["yt-dlp"]);
  }
  if (ytDlp.source !== "managed") {
    console.log(
      `O yt-dlp em uso (${ytDlp.path}) não é gerenciado pelo jukeboxdl.\n` +
        "Atualize pelo gerenciador de pacotes, ou rode `jukeboxdl deps install --force` para usar uma cópia gerenciada.",
    );
    return;
  }

  const latest = await latestYtDlpVersion();
  if (latest === ytDlp.version) {
    console.log(`✔ yt-dlp já está na versão mais recente (${latest}).`);
    return;
  }
  console.log(`Atualizando yt-dlp ${ytDlp.version ?? "?"} → ${latest}`);
  await runInstaller(["yt-dlp"]);
}
