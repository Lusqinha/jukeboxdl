import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";

export async function isExecutable(
  path: string,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    if (platform !== "win32") await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Procura um executável no PATH, como o comando `which`. */
export async function which(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const isWindows = platform === "win32";
  const dirs = (env.PATH ?? env.Path ?? "").split(isWindows ? ";" : ":").filter(Boolean);
  const extensions = isWindows ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];

  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = join(dir, command + extension);
      if (await isExecutable(candidate, platform)) return candidate;
    }
  }
  return null;
}
