import { z } from "zod";
import { validateTemplate } from "../template/template";

z.config(z.locales.ptBR());

const templateString = z
  .string()
  .min(1)
  .superRefine((value, ctx) => {
    for (const issue of validateTemplate(value)) {
      ctx.addIssue({ code: "custom", message: issue.message });
    }
  });

export const THEMES = ["neon", "classico"] as const;
export type ThemeName = (typeof THEMES)[number];

export const configSchema = z.object({
  /** Visual da interface interativa. */
  // "lataria" foi o nome anterior do tema neon.
  theme: z
    .preprocess((value) => (value === "lataria" ? "neon" : value), z.enum(THEMES))
    .default("neon"),
  /** Pasta base dos downloads; aceita `~`. */
  outputDir: z.string().min(1).default("~/Music"),
  /** Template para faixas avulsas. */
  filenameTemplate: templateString.default("{artist} - {title}"),
  /** Template para faixas baixadas a partir de uma playlist. */
  playlistTemplate: templateString.default("{playlist}/{index:03} - {artist} - {title}"),
  audio: z
    .object({
      bitrate: z.literal([128, 192, 256, 320]).default(192),
      embedCover: z.boolean().default(true),
    })
    .prefault({}),
  /** Quantos downloads rodam ao mesmo tempo. */
  concurrency: z.number().int().min(1).max(8).default(3),
  /** Pular faixas que já estão no histórico. */
  skipDuplicates: z.boolean().default(true),
  /** Caminhos explícitos para os binários; o ffprobe é procurado ao lado do ffmpeg. */
  binaries: z
    .object({
      ytDlp: z.string().min(1).optional(),
      ffmpeg: z.string().min(1).optional(),
    })
    .prefault({}),
});

export type Config = z.output<typeof configSchema>;
export type ConfigInput = z.input<typeof configSchema>;

export const DEFAULT_CONFIG: Config = configSchema.parse({});
