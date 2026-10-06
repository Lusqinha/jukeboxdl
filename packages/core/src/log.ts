import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let logFile: string | null = null;

/** Liga o log de depuração (comandos executados, saídas de erro) no arquivo indicado. */
export function enableDebugLog(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  logFile = file;
  debug(
    `--- jukeboxdl ${new Date().toISOString()} (node ${process.version}, ${process.platform}/${process.arch})`,
  );
}

export function isDebugLogEnabled(): boolean {
  return logFile !== null;
}

export function debug(message: string): void {
  if (!logFile) return;
  try {
    appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Falhar ao registrar log nunca deve interromper o app.
  }
}
