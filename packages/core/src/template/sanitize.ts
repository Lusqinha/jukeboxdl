const REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  // biome-ignore lint/suspicious/noControlCharactersInRegex: remover caracteres de controle é o objetivo
  [/[\u0000-\u001f\u007f]/g, " "],
  [/[/\\|]/g, "-"],
  [/\s*:\s+/g, " - "],
  [/:/g, "-"],
  [/"/g, "'"],
  [/[<>?*]/g, ""],
];

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/**
 * Torna um texto seguro para ser um nome de arquivo ou pasta em qualquer sistema,
 * e remove sobras de separadores quando alguma variável do template veio vazia.
 */
export function sanitizeSegment(input: string): string {
  let value = input.normalize("NFC");
  for (const [pattern, replacement] of REPLACEMENTS) value = value.replace(pattern, replacement);

  value = value
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+-(?:\s*-)+\s+/g, " - ")
    .replace(/^[\s\-_.,;]+|[\s\-_.,;]+$/g, "");

  if (WINDOWS_RESERVED.test(value)) value = `_${value}`;
  return value;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Corta o texto para caber em `maxBytes` (UTF-8) sem quebrar caracteres compostos. */
export function truncateBytes(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value) <= maxBytes) return value;
  let result = "";
  let size = 0;
  for (const { segment } of segmenter.segment(value)) {
    const segmentSize = Buffer.byteLength(segment);
    if (size + segmentSize > maxBytes) break;
    result += segment;
    size += segmentSize;
  }
  return result.trimEnd();
}
