import { DownloadError } from "../errors";
import type { TrackMetadata } from "../metadata";
import { runCommand } from "../process";

export interface WriteTagsOptions {
  ffmpeg: string;
  input: string;
  output: string;
  metadata: TrackMetadata;
  /** JPG da capa; é recortado no centro para ficar quadrado. */
  cover?: string | undefined;
  signal?: AbortSignal | undefined;
}

export function buildTagArgs({ input, output, metadata, cover }: WriteTagsOptions): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", input];

  if (cover) {
    args.push(
      "-i",
      cover,
      "-map",
      "0:a",
      "-map",
      "1:v",
      "-c:v",
      "mjpeg",
      "-q:v",
      "2",
      "-vf",
      "crop='min(iw,ih)':'min(iw,ih)',scale='min(iw,800)':-1",
      "-disposition:v",
      "attached_pic",
      "-metadata:s:v",
      "title=Album cover",
      "-metadata:s:v",
      "comment=Cover (front)",
    );
  } else {
    args.push("-map", "0:a");
  }

  args.push("-c:a", "copy", "-map_metadata", "-1", "-id3v2_version", "3", "-write_id3v1", "1");

  const tags: Record<string, string | number | undefined> = {
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    track: metadata.track,
    date: metadata.year,
    comment: metadata.id ? `https://youtu.be/${metadata.id}` : undefined,
  };
  for (const [key, value] of Object.entries(tags)) {
    if (value !== undefined && value !== "") args.push("-metadata", `${key}=${value}`);
  }

  args.push("-f", "mp3", output);
  return args;
}

/** Grava as tags ID3v2.3 (e a capa) gerando um novo arquivo em `output`. */
export async function writeTags(options: WriteTagsOptions): Promise<void> {
  const result = await runCommand(options.ffmpeg, buildTagArgs(options), {
    signal: options.signal,
  });
  if (result.code !== 0) {
    throw new DownloadError(`Falha ao gravar as tags: ${result.stderr.trim() || result.code}`);
  }
}
