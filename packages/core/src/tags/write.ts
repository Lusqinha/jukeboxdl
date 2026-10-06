import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AudioFormat } from "../config/schema";
import { DownloadError } from "../errors";
import { t } from "../i18n/messages";
import type { TrackMetadata } from "../metadata";
import { runCommand } from "../process";
import type { PreparedCover } from "./cover";

export interface WriteTagsOptions {
  ffmpeg: string;
  input: string;
  output: string;
  format: AudioFormat;
  metadata: TrackMetadata;
  cover?: PreparedCover | undefined;
  /** Tags extras (ex.: ReplayGain). Ignoradas no m4a, cujo muxer só grava as conhecidas. */
  extraTags?: Record<string, string> | undefined;
  /** Pasta para arquivos temporários (metadados do opus). */
  workdir: string;
  signal?: AbortSignal | undefined;
}

export function textTags(metadata: TrackMetadata): Record<string, string> {
  const tags: Record<string, string | number | undefined> = {
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    track: metadata.track,
    date: metadata.year,
    comment: metadata.id ? `https://youtu.be/${metadata.id}` : undefined,
  };
  return Object.fromEntries(
    Object.entries(tags).flatMap(([key, value]) =>
      value === undefined || value === "" ? [] : [[key, String(value)]],
    ),
  );
}

const metadataArgs = (tags: Record<string, string>) =>
  Object.entries(tags).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]);

/** Argumentos do ffmpeg para mp3 e m4a (capa como stream de imagem anexada). */
export function buildTagArgs({
  input,
  output,
  format,
  metadata,
  cover,
  extraTags,
}: WriteTagsOptions): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", input];
  if (cover) {
    args.push(
      "-i",
      cover.path,
      "-map",
      "0:a",
      "-map",
      "1:v",
      "-c:v",
      "copy",
      "-disposition:v",
      "attached_pic",
    );
    if (format === "mp3")
      args.push("-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)");
  } else {
    args.push("-map", "0:a");
  }
  args.push("-c:a", "copy", "-map_metadata", "-1");
  if (format === "mp3") args.push("-id3v2_version", "3", "-write_id3v1", "1");
  args.push(...metadataArgs(textTags(metadata)));
  if (format === "mp3" && extraTags) args.push(...metadataArgs(extraTags));
  args.push("-f", format === "mp3" ? "mp3" : "ipod", output);
  return args;
}

/** Bloco PICTURE do FLAC (tipo 3 = capa frontal), usado em METADATA_BLOCK_PICTURE no Ogg. */
export function flacPictureBlock(
  image: Buffer,
  cover: Pick<PreparedCover, "width" | "height">,
): Buffer {
  const mime = Buffer.from("image/jpeg");
  const u32 = (value: number) => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(value);
    return buffer;
  };
  return Buffer.concat([
    u32(3),
    u32(mime.length),
    mime,
    u32(0),
    u32(cover.width),
    u32(cover.height),
    u32(24),
    u32(0),
    u32(image.length),
    image,
  ]);
}

const escapeFfmetadata = (value: string) => value.replace(/([=;#\\\n])/g, "\\$1");

export function buildFfmetadata(tags: Record<string, string>): string {
  const lines = Object.entries(tags).map(
    ([key, value]) => `${escapeFfmetadata(key)}=${escapeFfmetadata(value)}`,
  );
  return `;FFMETADATA1\n${lines.join("\n")}\n`;
}

async function writeOpusTags(options: WriteTagsOptions): Promise<string[]> {
  const { input, output, metadata, cover, extraTags, workdir } = options;
  const tags: Record<string, string> = { ...textTags(metadata), ...extraTags };
  if (cover) {
    const block = flacPictureBlock(await readFile(cover.path), cover);
    tags.METADATA_BLOCK_PICTURE = block.toString("base64");
  }
  const metaFile = join(workdir, "tags.ffmeta");
  await writeFile(metaFile, buildFfmetadata(tags));
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-i",
    metaFile,
    "-map",
    "0:a",
    "-c",
    "copy",
    "-map_metadata",
    "-1",
    "-map_metadata:s:a:0",
    "1:g",
    "-f",
    "opus",
    output,
  ];
}

/** Grava tags e capa gerando um novo arquivo em `output`. */
export async function writeTags(options: WriteTagsOptions): Promise<void> {
  const args = options.format === "opus" ? await writeOpusTags(options) : buildTagArgs(options);
  const result = await runCommand(options.ffmpeg, args, { signal: options.signal });
  if (result.code !== 0) {
    throw new DownloadError(
      t("tags.failed", { error: result.stderr.trim() || String(result.code) }),
    );
  }
}
