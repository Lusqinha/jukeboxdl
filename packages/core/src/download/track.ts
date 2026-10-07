import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { AudioFormat, Config } from "../config/schema";
import { findCover } from "../covers/providers";
import { moveFile, pathExists } from "../fs";
import type { TrackMetadata } from "../metadata";
import { enrichFromMusicBrainz } from "../metadata/musicbrainz";
import { expandHome } from "../paths";
import { type PreparedCover, prepareCover } from "../tags/cover";
import { cleanTitle, metadataFromInfo, splitArtistTitle } from "../tags/extract";
import { measureLoudness, normalizeAudio, r128TrackGain, replayGainTags } from "../tags/loudness";
import { writeTags } from "../tags/write";
import { renderTemplate } from "../template/template";
import type { YtDlp } from "../ytdlp/client";
import type { DownloadProgress, VideoSummary, YtDlpInfo } from "../ytdlp/types";

export interface TrackRequest {
  video: VideoSummary;
  /** Preenchido quando a faixa vem de uma playlist; ativa o `playlistTemplate`. */
  playlist?: string | undefined;
  index?: number | undefined;
  /** Divide o vídeo em uma faixa por capítulo (mixes, álbuns completos). */
  splitChapters?: boolean | undefined;
  /** Baixa de novo mesmo que esteja no histórico, sobrescrevendo o arquivo. */
  redownload?: boolean | undefined;
  /** Pasta de destino só deste download (ex.: um pendrive), no lugar da pasta da config. */
  outputDir?: string | undefined;
}

export interface TrackResult {
  /** `exists`: o arquivo de destino já existia e nada foi baixado. */
  status: "downloaded" | "exists";
  /** Primeiro arquivo gerado (o único, quando não há divisão por capítulos). */
  path: string;
  paths: string[];
  metadata: TrackMetadata;
}

export type TrackConfig = Pick<
  Config,
  "outputDir" | "filenameTemplate" | "playlistTemplate" | "audio" | "musicbrainz" | "cover"
>;

export interface DownloadTrackOptions {
  ytdlp: YtDlp;
  ffmpeg: string;
  config: TrackConfig;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: DownloadProgress) => void) | undefined;
  /** Para testes: substitui o fetch usado pelo MusicBrainz. */
  fetch?: typeof fetch;
}

export function destinationFor(
  metadata: TrackMetadata,
  config: Pick<TrackConfig, "outputDir" | "filenameTemplate" | "playlistTemplate">,
  fromPlaylist: boolean,
  extension: AudioFormat = "mp3",
): string {
  const template = fromPlaylist ? config.playlistTemplate : config.filenameTemplate;
  return join(expandHome(config.outputDir), renderTemplate(template, metadata, { extension }));
}

/** Metadados de um capítulo: o vídeo vira o "álbum" e o capítulo, a faixa. */
export function chapterMetadata(
  video: TrackMetadata,
  chapterTitle: string,
  number: number,
): TrackMetadata {
  const cleaned = cleanTitle(chapterTitle.replace(/^\s*\d+[.)\-\s]+/, "")) || chapterTitle;
  const split = splitArtistTitle(cleaned);
  return {
    id: video.id,
    title: split?.title ?? cleaned,
    artist: split?.artist ?? video.artist,
    album: video.title,
    track: number,
    year: video.year,
    playlist: video.title,
    index: number,
    uploader: video.uploader,
  };
}

/** Faixas do YouTube Music (com campos de música) trazem a capa quadrada no meio do quadro. */
const isMusicTrack = (info: YtDlpInfo) => Boolean(info.track || info.artists?.length || info.album);

/** Capa da fonte configurada (APIs) ou, sem resultado, a thumbnail do YouTube. */
async function chooseCover(
  metadata: TrackMetadata,
  thumbnail: string | undefined,
  info: YtDlpInfo,
  { ffmpeg, config, signal, fetch: fetchImpl }: DownloadTrackOptions,
  workdir: string,
): Promise<PreparedCover | undefined> {
  const found = await findCover(
    { title: metadata.title, artist: metadata.artist, album: metadata.album },
    config.cover.source,
    {
      signal,
      ...(fetchImpl && { fetch: fetchImpl }),
    },
  );
  if (found) {
    const path = join(workdir, "cover-api.jpg");
    await writeFile(path, found.image);
    const cover = await prepareCover(ffmpeg, path, workdir, { square: true, signal });
    if (cover) return cover;
  }
  return thumbnail
    ? prepareCover(ffmpeg, thumbnail, workdir, { square: isMusicTrack(info), signal })
    : undefined;
}

async function finalize(
  input: string,
  destination: string,
  metadata: TrackMetadata,
  cover: PreparedCover | undefined,
  { ffmpeg, config, signal }: DownloadTrackOptions,
  workdir: string,
): Promise<void> {
  const format = config.audio.format;
  if (config.audio.normalize && format !== "mp3") {
    const normalized = join(workdir, `normalized-${basename(input)}`);
    if (await normalizeAudio(ffmpeg, input, normalized, format, signal)) input = normalized;
  }
  let extraTags: Record<string, string> | undefined;
  if (config.audio.replayGain) {
    const loudness = await measureLoudness(ffmpeg, input, signal);
    if (loudness) {
      extraTags = replayGainTags(loudness);
      if (format === "opus") extraTags.R128_TRACK_GAIN = r128TrackGain(loudness);
    }
  }
  const tagged = join(workdir, `tagged-${basename(input)}`);
  await writeTags({
    ffmpeg,
    input,
    output: tagged,
    format,
    metadata,
    cover,
    extraTags,
    workdir,
    signal,
  });
  await mkdir(dirname(destination), { recursive: true });
  await moveFile(tagged, destination);
}

/**
 * Lê os metadados, decide o destino (pulando se o arquivo já existe, sem baixar), baixa,
 * mede o volume, grava tags e capa e move para a pasta final.
 */
export async function downloadTrack(
  request: TrackRequest,
  options: DownloadTrackOptions,
): Promise<TrackResult> {
  const { ytdlp, ffmpeg, signal, onProgress } = options;
  const config = request.outputDir
    ? { ...options.config, outputDir: request.outputDir }
    : options.config;
  options = { ...options, config };
  const format = config.audio.format;
  const workdir = await mkdtemp(join(tmpdir(), "jukeboxdl-"));
  try {
    const info = await ytdlp.fetchInfo(request.video.url, signal);
    let metadata = metadataFromInfo(info, { playlist: request.playlist, index: request.index });
    if (config.musicbrainz) {
      metadata = await enrichFromMusicBrainz(metadata, {
        signal,
        ...(options.fetch && { fetch: options.fetch }),
      });
    }

    const chapters = (info.chapters ?? []).filter((chapter) => chapter.title);
    const split = Boolean(request.splitChapters) && chapters.length > 1;
    const destination = destinationFor(metadata, config, request.playlist !== undefined, format);
    if (!split && !request.redownload && (await pathExists(destination))) {
      return { status: "exists", path: destination, paths: [destination], metadata };
    }

    const infoFile = join(workdir, "video.info.json");
    await writeFile(infoFile, JSON.stringify(info));
    const files = await ytdlp.downloadAudio(infoFile, workdir, {
      format,
      bitrate: config.audio.bitrate,
      removeNonMusic: config.audio.removeNonMusic,
      splitChapters: split,
      normalize: config.audio.normalize,
      signal,
      onProgress,
    });

    onProgress?.({ phase: "tag" });
    const cover = config.audio.embedCover
      ? await chooseCover(metadata, files.cover, info, options, workdir)
      : undefined;

    if (!split || files.chapters.length === 0) {
      await finalize(files.audio, destination, metadata, cover, options, workdir);
      return { status: "downloaded", path: destination, paths: [destination], metadata };
    }

    const paths: string[] = [];
    for (const [i, file] of files.chapters.entries()) {
      const chapter = chapterMetadata(metadata, chapters[i]?.title ?? `${i + 1}`, i + 1);
      const target = destinationFor(chapter, config, true, format);
      if (!request.redownload && (await pathExists(target))) {
        paths.push(target);
        continue;
      }
      await finalize(file, target, chapter, cover, options, workdir);
      paths.push(target);
    }
    return { status: "downloaded", path: paths[0] ?? destination, paths, metadata };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
