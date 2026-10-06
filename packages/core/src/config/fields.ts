import { ConfigError } from "../errors";
import { type Config, configSchema } from "./schema";

export type ConfigFieldType = "path" | "template" | "choice" | "boolean" | "number";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  description: string;
  choices?: readonly number[];
  optional?: boolean;
}

/** Campos editáveis pelas interfaces, na ordem de exibição. */
export const CONFIG_FIELDS: readonly ConfigField[] = [
  {
    key: "outputDir",
    label: "Pasta de destino",
    type: "path",
    description: "Onde os MP3 são salvos",
  },
  {
    key: "filenameTemplate",
    label: "Nome de faixa avulsa",
    type: "template",
    description: "Template usado em buscas e links de vídeo",
  },
  {
    key: "playlistTemplate",
    label: "Nome de faixa de playlist",
    type: "template",
    description: "Template usado em faixas vindas de playlists",
  },
  {
    key: "audio.bitrate",
    label: "Qualidade (kbps)",
    type: "choice",
    choices: [128, 192, 256, 320],
    description: "Bitrate do MP3; o YouTube entrega ~160 kbps, acima disso só aumenta o arquivo",
  },
  {
    key: "audio.embedCover",
    label: "Embutir capa",
    type: "boolean",
    description: "Grava a thumbnail como capa",
  },
  {
    key: "concurrency",
    label: "Downloads simultâneos",
    type: "number",
    description: "De 1 a 8",
  },
  {
    key: "skipDuplicates",
    label: "Pular já baixadas",
    type: "boolean",
    description: "Usa o histórico para não baixar a mesma faixa de novo",
  },
  {
    key: "binaries.ytDlp",
    label: "Caminho do yt-dlp",
    type: "path",
    optional: true,
    description: "Vazio = detectar automaticamente",
  },
  {
    key: "binaries.ffmpeg",
    label: "Caminho do ffmpeg",
    type: "path",
    optional: true,
    description: "Vazio = detectar automaticamente; o ffprobe deve estar na mesma pasta",
  },
];

export function findConfigField(key: string): ConfigField {
  const field = CONFIG_FIELDS.find((f) => f.key === key);
  if (!field) {
    const keys = CONFIG_FIELDS.map((f) => f.key).join(", ");
    throw new ConfigError(`Chave desconhecida "${key}". Use: ${keys}`, "");
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
      throw new ConfigError(`${field.key}: use sim/não (ou true/false)`, "", [
        `${field.key}: valor booleano inválido`,
      ]);
    case "number":
    case "choice": {
      const number = Number(value);
      if (!Number.isFinite(number) || value === "") {
        throw new ConfigError(`${field.key}: "${raw}" não é um número`, "", [
          `${field.key}: não é um número`,
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
  if (value === undefined) return "(automático)";
  if (typeof value === "boolean") return value ? "sim" : "não";
  return String(value);
}
