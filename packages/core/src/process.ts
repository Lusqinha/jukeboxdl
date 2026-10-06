import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface RunOptions {
  signal?: AbortSignal | undefined;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const MAX_STDERR = 64 * 1024;

/** Executa um processo sem shell, coletando a saída e repassando linha a linha. */
export function runCommand(
  command: string,
  args: readonly string[],
  { signal, onStdoutLine, onStderrLine }: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      ...(signal && { signal }),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-MAX_STDERR);
    });
    if (onStdoutLine) createInterface({ input: child.stdout }).on("line", onStdoutLine);
    if (onStderrLine) createInterface({ input: child.stderr }).on("line", onStderrLine);

    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}
