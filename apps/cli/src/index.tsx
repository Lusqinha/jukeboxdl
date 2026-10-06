import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { doctorCommand } from "./commands/doctor";

const program = new Command()
  .name("jukeboxdl")
  .description(pkg.description)
  .version(pkg.version, "-v, --version", "mostra a versão")
  .helpOption("-h, --help", "mostra esta ajuda")
  .helpCommand("help [comando]", "mostra a ajuda de um comando");

program
  .command("doctor")
  .description("verifica a configuração e as dependências (yt-dlp, ffmpeg)")
  .action(doctorCommand);

await program.parseAsync();
