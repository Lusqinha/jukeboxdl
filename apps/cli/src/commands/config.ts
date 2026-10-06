import {
  CONFIG_FIELDS,
  ConfigError,
  DEFAULT_CONFIG,
  findConfigField,
  formatConfigValue,
  getAppPaths,
  getConfigValue,
  renderTemplate,
  sampleTrack,
  saveConfig,
  setConfigValue,
  validateTemplate,
} from "@jukeboxdl/core";
import { t } from "../lib/i18n";
import { fail, loadConfigOrFail } from "../lib/session";

function handle<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ConfigError) fail(error.message);
    throw error;
  }
}

export async function configShowCommand(options: { json?: boolean }): Promise<void> {
  const config = await loadConfigOrFail();
  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  const width = Math.max(...CONFIG_FIELDS.map((f) => f.key.length));
  for (const field of CONFIG_FIELDS) {
    console.log(
      `${field.key.padEnd(width)}  ${formatConfigValue(getConfigValue(config, field.key))}`,
    );
  }
  console.log(`\n\x1b[2m${getAppPaths().configFile}\x1b[0m`);
}

export async function configGetCommand(key: string): Promise<void> {
  const config = await loadConfigOrFail();
  handle(() => findConfigField(key));
  const value = getConfigValue(config, key);
  console.log(value === undefined ? "" : String(value));
}

export async function configSetCommand(key: string, value: string): Promise<void> {
  const config = await loadConfigOrFail();
  const next = handle(() => setConfigValue(config, key, value));
  await saveConfig(next);
  console.log(`✔ ${key} = ${formatConfigValue(getConfigValue(next, key))}`);
  if (findConfigField(key).type === "template") {
    console.log(
      `  ${t("config.example")}: ${renderTemplate(String(getConfigValue(next, key)), sampleTrack())}`,
    );
  }
}

export async function configUnsetCommand(key: string): Promise<void> {
  const config = await loadConfigOrFail();
  const field = handle(() => findConfigField(key));
  const next = field.optional
    ? setConfigValue(config, key, "")
    : setConfigValue(config, key, String(getConfigValue(DEFAULT_CONFIG, key)));
  await saveConfig(next);
  console.log(`✔ ${key} = ${formatConfigValue(getConfigValue(next, key))}`);
}

export function configPreviewCommand(template: string): void {
  const issues = validateTemplate(template);
  if (issues.length > 0) {
    fail(
      issues
        .map((issue) =>
          t("config.position", { message: issue.message, position: issue.position + 1 }),
        )
        .join("\n  "),
    );
  }
  console.log(renderTemplate(template, sampleTrack()));
  console.log(`\x1b[2m${t("config.exampleWith", { track: JSON.stringify(sampleTrack()) })}\x1b[0m`);
}

export function configPathCommand(): void {
  console.log(getAppPaths().configFile);
}
