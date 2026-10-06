import { ConfigError } from "../errors";
import { LOCALES } from "../i18n";
import { type CoreMessageKey, t } from "../i18n/messages";
import { AUDIO_FORMATS, type Config, configSchema, THEMES } from "./schema";

export type ConfigFieldType = "path" | "template" | "choice" | "boolean" | "number";

export interface ConfigField {
  key: string;
  type: ConfigFieldType;
  choices?: readonly (number | string)[];
  optional?: boolean;
}

/** Campos editáveis pelas interfaces, na ordem de exibição. */
export const CONFIG_FIELDS: readonly ConfigField[] = [
  { key: "language", type: "choice", choices: ["auto", ...LOCALES], optional: true },
  { key: "theme", type: "choice", choices: THEMES },
  { key: "outputDir", type: "path" },
  { key: "filenameTemplate", type: "template" },
  { key: "playlistTemplate", type: "template" },
  { key: "audio.format", type: "choice", choices: AUDIO_FORMATS },
  { key: "audio.bitrate", type: "choice", choices: [128, 192, 256, 320] },
  { key: "audio.embedCover", type: "boolean" },
  { key: "audio.removeNonMusic", type: "boolean" },
  { key: "audio.replayGain", type: "boolean" },
  { key: "musicbrainz", type: "boolean" },
  { key: "concurrency", type: "number" },
  { key: "skipDuplicates", type: "boolean" },
  { key: "notifications", type: "boolean" },
  { key: "binaries.ytDlp", type: "path", optional: true },
  { key: "binaries.ffmpeg", type: "path", optional: true },
];

/** Nome do campo no idioma atual. */
export function fieldLabel(field: ConfigField): string {
  return t(`field.${field.key}.label` as CoreMessageKey);
}

/** Descrição do campo no idioma atual. */
export function fieldDescription(field: ConfigField): string {
  return t(`field.${field.key}.description` as CoreMessageKey);
}

export function findConfigField(key: string): ConfigField {
  const field = CONFIG_FIELDS.find((f) => f.key === key);
  if (!field) {
    const keys = CONFIG_FIELDS.map((f) => f.key).join(", ");
    throw new ConfigError(t("config.unknownKey", { key, keys }), "");
  }
  return field;
}

export function getConfigValue(config: Config, key: string): unknown {
  let value: unknown = config;
  for (const part of key.split(".")) {
    value =
      value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
  }
  return value;
}

const TRUE = new Set(["true", "1", "sim", "s", "yes", "y", "on"]);
const FALSE = new Set(["false", "0", "não", "nao", "n", "no", "off"]);

function coerce(field: ConfigField, raw: string): unknown {
  const value = raw.trim();
  if (field.optional && value === "") return undefined;
  switch (field.type) {
    case "boolean":
      if (TRUE.has(value.toLowerCase())) return true;
      if (FALSE.has(value.toLowerCase())) return false;
      throw new ConfigError(t("config.boolean", { key: field.key }), "", [
        t("config.booleanIssue", { key: field.key }),
      ]);
    case "choice":
    case "number": {
      if (field.type === "choice" && typeof field.choices?.[0] === "string") {
        return field.optional && value === "auto" ? undefined : value;
      }
      const number = Number(value);
      if (!Number.isFinite(number) || value === "") {
        throw new ConfigError(t("config.notNumber", { key: field.key, value: raw }), "", [
          t("config.notNumberIssue", { key: field.key }),
        ]);
      }
      return number;
    }
    default:
      return raw;
  }
}

/**
 * Retorna uma nova config com `key` alterada a partir de texto (como digitado na CLI/TUI).
 * Lança `ConfigError` se o valor não passar na validação.
 */
export function setConfigValue(config: Config, key: string, raw: string): Config {
  const field = findConfigField(key);
  const value = coerce(field, raw);
  const next = structuredClone(config) as Record<string, unknown>;

  const parts = key.split(".");
  const last = parts.pop() ?? key;
  let target = next;
  for (const part of parts) target = target[part] as Record<string, unknown>;
  if (value === undefined) delete target[last];
  else target[last] = value;

  const result = configSchema.safeParse(next);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new ConfigError(issues.join("\n"), "", issues);
  }
  return result.data;
}

export function formatConfigValue(value: unknown): string {
  if (value === undefined) return t("config.auto");
  if (typeof value === "boolean") return value ? t("config.yes") : t("config.no");
  return String(value);
}
