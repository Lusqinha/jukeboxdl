import { spawn } from "node:child_process";
import { debug } from "../log";

function detached(command: string, args: string[]): void {
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", (error) => debug(`${command}: ${error.message}`));
    child.unref();
  } catch (error) {
    debug(`${command}: ${String(error)}`);
  }
}

/** Notificação do sistema; falhas são ignoradas (é só um aviso). */
export function notify(title: string, body: string): void {
  if (process.platform === "linux") detached("notify-send", ["--app-name=jukeboxdl", title, body]);
  else if (process.platform === "darwin") {
    const quote = (text: string) => text.replace(/["\\]/g, "\\$&");
    detached("osascript", [
      "-e",
      `display notification "${quote(body)}" with title "${quote(title)}"`,
    ]);
  }
}

/** Abre um arquivo ou pasta no aplicativo padrão do sistema. */
export function openPath(path: string): void {
  if (process.platform === "darwin") detached("open", [path]);
  else if (process.platform === "win32") detached("explorer", [path]);
  else detached("xdg-open", [path]);
}
