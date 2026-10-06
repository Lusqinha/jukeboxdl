import { detectLocale, loadConfig, setLocale } from "@jukeboxdl/core";
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
import { t } from "./lib/i18n";
import { App } from "./tui/App";

// O idioma precisa estar definido antes de montar os textos de ajuda.
const savedConfig = await loadConfig().catch(() => undefined);
setLocale(savedConfig?.language ?? detectLocale());

async function tuiCommand(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    program.help();
  }
  const app = render(<App />, {
    alternateScreen: true,
    exitOnCtrlC: false,
    maxFps: 60,
    incrementalRendering: true,
  });
  await app.waitUntilExit();
}

const program = new Command()
  .name("jukeboxdl")
  .description(t("cli.description"))
  .version(pkg.version, "-v, --version", t("cli.version"))
  .helpOption("-h, --help", t("cli.help"))
  .helpCommand(t("cli.helpCommandArg"), t("cli.helpCommand"))
  .action(tuiCommand);

program
  .command("get")
  .description(t("cli.get"))
  .argument("<inputs...>", t("cli.get.inputs"))
  .option("-o, --output <dir>", t("cli.get.output"))
  .option("-t, --template <template>", t("cli.get.template"))
  .option("--playlist-template <template>", t("cli.get.playlistTemplate"))
  .addOption(
    new Option("-b, --bitrate <kbps>", t("cli.get.bitrate")).choices(["128", "192", "256", "320"]),
  )
  .option("-c, --concurrency <n>", t("cli.get.concurrency"))
  .option("-i, --items <range>", t("cli.get.items"))
  .option("--no-playlist", t("cli.get.noPlaylist"))
  .option("-f, --force", t("cli.get.force"))
  .option("--no-cover", t("cli.get.noCover"))
  .action(getCommand);

program
  .command("search")
  .description(t("cli.search"))
  .argument("<terms...>")
  .option("-n, --limit <n>", t("cli.search.limit"), "10")
  .option("--json", t("cli.json"))
  .action(searchCommand);

const config = program.command("config").description(t("cli.config"));
config
  .command("show", { isDefault: true })
  .description(t("cli.config.show"))
  .option("--json", t("cli.json"))
  .action(configShowCommand);
config.command("get").description(t("cli.config.get")).argument("<key>").action(configGetCommand);
config
  .command("set")
  .description(t("cli.config.set"))
  .argument("<key>")
  .argument("<value>")
  .action(configSetCommand);
config
  .command("unset")
  .description(t("cli.config.unset"))
  .argument("<key>")
  .action(configUnsetCommand);
config
  .command("preview")
  .description(t("cli.config.preview"))
  .argument("<template>")
  .action(configPreviewCommand);
config.command("path").description(t("cli.config.path")).action(configPathCommand);

const deps = program.command("deps").description(t("cli.deps"));
deps
  .command("install")
  .description(t("cli.deps.install"))
  .option("--force", t("cli.deps.force"))
  .action(depsInstallCommand);
deps.command("update").description(t("cli.deps.update")).action(depsUpdateCommand);

program.command("doctor").description(t("cli.doctor")).action(doctorCommand);

const history = program.command("history").description(t("cli.history"));
history
  .command("list", { isDefault: true })
  .description(t("cli.history.list"))
  .option("-s, --search <text>", t("cli.history.search"))
  .option("-n, --limit <n>", t("cli.history.limit"), "20")
  .option("--json", t("cli.json"))
  .action(historyListCommand);
history
  .command("remove")
  .description(t("cli.history.remove"))
  .argument("<id>")
  .action(historyRemoveCommand);

await program.parseAsync();
