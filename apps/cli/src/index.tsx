import { Command, Option } from "commander";
import { render } from "ink";
import pkg from "../package.json" with { type: "json" };
import {
  configGetCommand,
  configPathCommand,
  configPreviewCommand,
  configSetCommand,
  configShowCommand,
  configUnsetCommand,
} from "./commands/config";
import { depsInstallCommand, depsUpdateCommand } from "./commands/deps";
import { doctorCommand } from "./commands/doctor";
import { getCommand } from "./commands/get";
import { historyListCommand, historyRemoveCommand } from "./commands/history";
import { searchCommand } from "./commands/search";
import { App } from "./tui/App";

async function tuiCommand(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    program.help();
  }
  const app = render(<App />, { alternateScreen: true, exitOnCtrlC: false });
  await app.waitUntilExit();
}

const program = new Command()
  .name("jukeboxdl")
  .description(`${pkg.description}\n\nSem argumentos, abre a interface interativa.`)
  .version(pkg.version, "-v, --version", "mostra a versão")
  .helpOption("-h, --help", "mostra esta ajuda")
  .helpCommand("help [comando]", "mostra a ajuda de um comando")
  .action(tuiCommand);

program
  .command("get")
  .description("baixa links de vídeo/playlist ou o primeiro resultado de cada busca")
  .argument("<entradas...>", 'links ou termos de busca (use aspas: "artista música")')
  .option("-o, --output <pasta>", "pasta de destino")
  .option("-t, --template <template>", 'template do nome, ex.: "{artist} - {title}"')
  .option("--playlist-template <template>", "template para faixas de playlist")
  .addOption(
    new Option("-b, --bitrate <kbps>", "qualidade do MP3").choices(["128", "192", "256", "320"]),
  )
  .option("-c, --concurrency <n>", "downloads simultâneos (1-8)")
  .option("-i, --items <intervalo>", "faixas da playlist a baixar, ex.: 1-5,8")
  .option("--no-playlist", "em links com vídeo e playlist, baixa só o vídeo")
  .option("-f, --force", "baixa mesmo se já estiver no histórico")
  .option("--no-cover", "não embute a capa")
  .action(getCommand);

program
  .command("search")
  .description("busca no YouTube e lista os resultados")
  .argument("<termos...>")
  .option("-n, --limit <n>", "quantidade de resultados", "10")
  .option("--json", "saída em JSON")
  .action(searchCommand);

const config = program.command("config").description("mostra ou altera a configuração");
config
  .command("show", { isDefault: true })
  .description("mostra a configuração atual")
  .option("--json", "saída em JSON")
  .action(configShowCommand);
config.command("get").description("lê um valor").argument("<chave>").action(configGetCommand);
config
  .command("set")
  .description("altera um valor (ex.: audio.bitrate 320)")
  .argument("<chave>")
  .argument("<valor>")
  .action(configSetCommand);
config
  .command("unset")
  .description("volta um valor ao padrão")
  .argument("<chave>")
  .action(configUnsetCommand);
config
  .command("preview")
  .description("mostra como um template fica com uma faixa de exemplo")
  .argument("<template>")
  .action(configPreviewCommand);
config
  .command("path")
  .description("mostra o caminho do arquivo de configuração")
  .action(configPathCommand);

const deps = program.command("deps").description("gerencia yt-dlp e ffmpeg");
deps
  .command("install")
  .description("baixa as dependências que faltam")
  .option("--force", "baixa mesmo se já existirem")
  .action(depsInstallCommand);
deps
  .command("update")
  .description("atualiza o yt-dlp gerenciado para a versão mais recente")
  .action(depsUpdateCommand);

program
  .command("doctor")
  .description("verifica a configuração e as dependências")
  .action(doctorCommand);

const history = program.command("history").description("faixas já baixadas");
history
  .command("list", { isDefault: true })
  .description("lista os downloads mais recentes")
  .option("-s, --search <texto>", "filtra por título, artista ou álbum")
  .option("-n, --limit <n>", "quantidade", "20")
  .option("--json", "saída em JSON")
  .action(historyListCommand);
history
  .command("remove")
  .description("remove um vídeo do histórico (não apaga o arquivo)")
  .argument("<id>")
  .action(historyRemoveCommand);

await program.parseAsync();
