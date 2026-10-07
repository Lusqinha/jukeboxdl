import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import type { AudioFormat } from "../config/schema";
import { runCommand } from "../process";
import { type PreparedCover, prepareCover } from "../tags/cover";
import { buildFfmetadata, flacPictureBlock } from "../tags/write";
import { type CoverSource, findCover } from "./providers";

const execFileAsync = promisify(execFile);

export type CoverUpdateResult =
  | { status: "updated"; source: string }
  | { status: "not-found" }
  | { status: "unsupported" };

const FORMATS: Record<string, AudioFormat> = { ".mp3": "mp3", ".opus": "opus", ".m4a": "m4a" };

interface Probe {
  format?: { tags?: Record<string, string> };
  streams?: Array<{ codec_type?: string; tags?: Record<string, string> }>;
}

/** Tags do arquivo com chaves em minúsculas (no opus elas ficam no stream de áudio). */
export async function readTags(ffprobe: string, file: string): Promise<Record<string, string>> {
  const { stdout } = await execFileAsync(ffprobe, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const probe = JSON.parse(stdout) as Probe;
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const tags = { ...probe.format?.tags, ...audio?.tags };
  return Object.fromEntries(Object.entries(tags).map(([key, value]) => [key.toLowerCase(), value]));
}

/** Troca só a capa, preservando áudio e todas as tags; grava ao lado e substitui no fim. */
export async function replaceCover({
  ffmpeg,
  ffprobe,
  file,
  cover,
  workdir,
  signal,
}: {
  ffmpeg: string;
  ffprobe: string;
  file: string;
  cover: PreparedCover;
  workdir: string;
  signal?: AbortSignal | undefined;
}): Promise<boolean> {
  const format = FORMATS[extname(file).toLowerCase()];
  if (!format) return false;
  const temp = join(dirname(file), `.${basename(file)}.jukeboxdl-tmp`);
  const base = ["-hide_banner", "-loglevel", "error", "-y", "-i", file];
  let args: string[];

  if (format === "opus") {
    const tags = await readTags(ffprobe, file);
    delete tags.metadata_block_picture;
    delete tags.encoder;
    tags.METADATA_BLOCK_PICTURE = flacPictureBlock(await readFile(cover.path), cover).toString(
      "base64",
    );
    const metaFile = join(workdir, "cover.ffmeta");
    await writeFile(metaFile, buildFfmetadata(tags));
    args = [
      ...base,
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
      temp,
    ];
  } else {
    args = [
      ...base,
      "-i",
      cover.path,
      "-map",
      "0:a",
      "-map",
      "1:v",
      "-c",
      "copy",
      "-map_metadata",
      "0",
      "-disposition:v",
      "attached_pic",
    ];
    if (format === "mp3") {
      args.push(
        "-id3v2_version",
        "3",
        "-metadata:s:v",
        "title=Album cover",
        "-metadata:s:v",
        "comment=Cover (front)",
        "-f",
        "mp3",
      );
    } else {
      args.push("-f", "ipod");
    }
    args.push(temp);
  }

  const result = await runCommand(ffmpeg, args, { signal });
  if (result.code !== 0) {
    await rm(temp, { force: true });
    return false;
  }
  await rename(temp, file);
  return true;
}

/** Busca uma capa nova para um arquivo já baixado, usando título/artista/álbum das tags. */
export async function updateCover(
  file: string,
  {
    source,
    ffmpeg,
    ffprobe,
    fetch: fetchImpl = fetch,
    signal,
  }: {
    source: CoverSource;
    ffmpeg: string;
    ffprobe: string;
    fetch?: typeof fetch;
    signal?: AbortSignal | undefined;
  },
): Promise<CoverUpdateResult> {
  if (!FORMATS[extname(file).toLowerCase()]) return { status: "unsupported" };
  const tags = await readTags(ffprobe, file);
  const workdir = await mkdtemp(join(tmpdir(), "jukeboxdl-cover-"));
  try {
    let image: Buffer | null = null;
    let used = "";
    let square = true;
    if (source !== "youtube" && tags.title) {
      const found = await findCover(
        { title: tags.title, artist: tags.artist, album: tags.album },
        source,
        {
          fetch: fetchImpl,
          signal,
        },
      );
      if (found) {
        image = found.image;
        used = found.source;
      }
    }
    // Sem capa nas APIs (ou fonte "youtube"): thumbnail do vídeo, pelo id guardado no comentário.
    if (!image && (source === "youtube" || source === "auto")) {
      const id = /youtu\.be\/([\w-]{11})/.exec(tags.comment ?? "")?.[1];
      for (const name of ["maxresdefault", "hqdefault"]) {
        if (!id || image) break;
        const response = await fetchImpl(`https://i.ytimg.com/vi/${id}/${name}.jpg`, {
          ...(signal && { signal }),
        });
        if (response.ok) {
          image = Buffer.from(await response.arrayBuffer());
          used = "youtube";
          square = false;
        }
      }
    }
    if (!image) return { status: "not-found" };

    const raw = join(workdir, "cover-source.jpg");
    await writeFile(raw, image);
    const cover = await prepareCover(ffmpeg, raw, workdir, { square, signal });
    if (!cover) return { status: "not-found" };
    return (await replaceCover({ ffmpeg, ffprobe, file, cover, workdir, signal }))
      ? { status: "updated", source: used }
      : { status: "not-found" };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
