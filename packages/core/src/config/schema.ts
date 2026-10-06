import { z } from "zod";
import { LOCALES } from "../i18n";
import { validateTemplate } from "../template/template";

const templateString = z
  .string()
  .min(1)
  .superRefine((value, ctx) => {
    for (const issue of validateTemplate(value)) {
      ctx.addIssue({ code: "custom", message: issue.message });
    }
  });

export const THEMES = ["neon", "classico"] as const;
export const AUDIO_FORMATS = ["mp3", "opus", "m4a"] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];
export type ThemeName = (typeof THEMES)[number];

export const configSchema = z.object({
  /** Idioma da interface; ausente = detectar pelo sistema. */
  language: z.enum(LOCALES).optional(),
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
      /** mp3 é convertido; opus e m4a mantêm o áudio original do YouTube quando possível. */
      format: z.enum(AUDIO_FORMATS).default("mp3"),
      /** Só vale para mp3. */
      bitrate: z.literal([128, 192, 256, 320]).default(192),
      embedCover: z.boolean().default(true),
      /** Remove trechos sem música (falas, introduções) usando o SponsorBlock. */
      removeNonMusic: z.boolean().default(true),
      /** Normaliza o volume do próprio áudio (alvo -14 LUFS); opus/m4a passam a ser recodificados. */
      normalize: z.boolean().default(true),
      /** Grava tags ReplayGain para tocar tudo no mesmo volume. */
      replayGain: z.boolean().default(true),
    })
    .prefault({}),
  /** Quantos downloads rodam ao mesmo tempo. */
  concurrency: z.number().int().min(1).max(8).default(3),
  /** Completar álbum, ano e número da faixa pelo MusicBrainz quando faltarem. */
  musicbrainz: z.boolean().default(true),
  /** Notificação do sistema quando a fila termina. */
  notifications: z.boolean().default(true),
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
