import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";
import { ConfigError } from "../errors";
import { getAppPaths } from "../paths";
import { type Config, type ConfigInput, configSchema } from "./schema";

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Lê a configuração; se o arquivo não existir, retorna os padrões. */
export async function loadConfig(file = getAppPaths().configFile): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return configSchema.parse({});
    throw error;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(`JSON inválido em ${file}: ${(error as Error).message}`, file);
  }

  const result = configSchema.safeParse(json);
  if (!result.success) {
    const issues = formatIssues(result.error);
    throw new ConfigError(
      `Configuração inválida em ${file}:\n  ${issues.join("\n  ")}`,
      file,
      issues,
    );
  }
  return result.data;
}

/** Valida e grava a configuração de forma atômica. */
export async function saveConfig(
  config: ConfigInput,
  file = getAppPaths().configFile,
): Promise<Config> {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const issues = formatIssues(result.error);
    throw new ConfigError(`Configuração inválida:\n  ${issues.join("\n  ")}`, file, issues);
  }

  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(result.data, null, 2)}\n`, "utf8");
  await rename(tmp, file);
  return result.data;
}
