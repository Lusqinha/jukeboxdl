import { TemplateError, type TemplateIssue } from "../errors";
import type { TrackMetadata } from "../metadata";
import { sanitizeSegment, truncateBytes } from "./sanitize";

export const TEMPLATE_VARIABLES = {
  title: "Título da faixa",
  artist: "Artista",
  album: "Álbum",
  track: "Número da faixa no álbum",
  year: "Ano de lançamento",
  playlist: "Nome da playlist",
  index: "Posição na playlist",
  uploader: "Canal que publicou o vídeo",
  id: "ID do vídeo",
} as const satisfies Record<keyof TrackMetadata, string>;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;

export type TemplateValues = Partial<Record<TemplateVariable, string | number | undefined>>;

export type TemplateToken =
  | { type: "text"; value: string }
  | { type: "variable"; name: TemplateVariable; pad?: number; fallback?: string };

export interface ParsedTemplate {
  tokens: TemplateToken[];
  issues: TemplateIssue[];
}

function isVariable(name: string): name is TemplateVariable {
  return Object.hasOwn(TEMPLATE_VARIABLES, name);
}

/**
 * Sintaxe:
 * - `{artist}`: valor da variável
 * - `{track:02}`: número com zeros à esquerda
 * - `{album|Singles}`: valor padrão quando a variável está vazia
 * - `/`: separa pastas
 * - `{{` e `}}`: chaves literais
 */
export function parseTemplate(template: string): ParsedTemplate {
  const tokens: TemplateToken[] = [];
  const issues: TemplateIssue[] = [];
  let text = "";
  let i = 0;

  const flushText = () => {
    if (text) tokens.push({ type: "text", value: text });
    text = "";
  };

  while (i < template.length) {
    const char = template[i];
    const next = template[i + 1];

    if ((char === "{" && next === "{") || (char === "}" && next === "}")) {
      text += char;
      i += 2;
      continue;
    }

    if (char === "}") {
      issues.push({ message: "Chave `}` sem `{` correspondente", position: i });
      i++;
      continue;
    }

    if (char !== "{") {
      text += char;
      i++;
      continue;
    }

    const end = template.indexOf("}", i);
    if (end === -1) {
      issues.push({ message: "Chave `{` não foi fechada", position: i });
      break;
    }

    const start = i;
    const body = template.slice(i + 1, end);
    i = end + 1;

    const match = /^([a-z]+)(?::(\d+))?(?:\|(.*))?$/s.exec(body);
    if (!match) {
      issues.push({ message: `Placeholder inválido: {${body}}`, position: start });
      continue;
    }

    const [, name = "", pad, fallback] = match;
    if (!isVariable(name)) {
      const known = Object.keys(TEMPLATE_VARIABLES).join(", ");
      issues.push({ message: `Variável desconhecida {${name}}. Use: ${known}`, position: start });
      continue;
    }

    flushText();
    tokens.push({
      type: "variable",
      name,
      ...(pad !== undefined && { pad: Number(pad) }),
      ...(fallback !== undefined && { fallback }),
    });
  }

  flushText();

  const hasUniqueField = tokens.some(
    (token) => token.type === "variable" && (token.name === "title" || token.name === "id"),
  );
  if (issues.length === 0 && !hasUniqueField) {
    issues.push({
      message: "O template precisa conter {title} ou {id} para que os arquivos não se sobrescrevam",
      position: 0,
    });
  }

  return { tokens, issues };
}

export function validateTemplate(template: string): TemplateIssue[] {
  return parseTemplate(template).issues;
}

export interface RenderOptions {
  extension?: string;
  /** Limite de bytes por nome de pasta/arquivo (a maioria dos sistemas aceita 255). */
  maxSegmentBytes?: number;
}

const FALLBACK_FILENAME = "Sem título";

function formatValue(value: string | number | undefined, pad: number | undefined): string {
  if (value === undefined) return "";
  const text = String(value).trim();
  if (pad !== undefined && /^\d+$/.test(text)) return text.padStart(pad, "0");
  return text;
}

/**
 * Gera o caminho relativo (com `/` como separador) do arquivo a partir do template.
 * Barras vindas dos valores (ex.: "AC/DC") nunca criam pastas.
 */
export function renderTemplate(
  template: string,
  values: TemplateValues,
  { extension = "mp3", maxSegmentBytes = 240 }: RenderOptions = {},
): string {
  const { tokens, issues } = parseTemplate(template);
  if (issues.length > 0) {
    throw new TemplateError(`Template inválido: ${issues[0]?.message}`, issues);
  }

  const segments: string[] = [""];
  const append = (text: string) => {
    segments[segments.length - 1] += text;
  };

  for (const token of tokens) {
    if (token.type === "variable") {
      const value = formatValue(values[token.name], token.pad) || token.fallback || "";
      append(value.replace(/[/\\]/g, "-"));
      continue;
    }
    const [first = "", ...rest] = token.value.split(/[/\\]/);
    append(first);
    for (const part of rest) segments.push(part);
  }

  const suffix = extension ? `.${extension}` : "";
  const cleaned = segments.map(sanitizeSegment);
  const filename = cleaned.pop() || FALLBACK_FILENAME;
  const directories = cleaned
    .filter(Boolean)
    .map((segment) => truncateBytes(segment, maxSegmentBytes));

  const base = truncateBytes(filename, maxSegmentBytes - Buffer.byteLength(suffix));
  return [...directories, `${base}${suffix}`].join("/");
}

/** Faixa fictícia usada para pré-visualizar templates. */
export const SAMPLE_TRACK = {
  id: "abc123xyz00",
  title: "Nome da Música",
  artist: "Artista",
  album: "Álbum",
  track: 3,
  year: 2024,
  playlist: "Minha Playlist",
  index: 7,
  uploader: "Canal",
} as const satisfies TemplateValues;
