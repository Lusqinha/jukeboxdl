import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Config } from "../config/schema";
import { moveFile, pathExists } from "../fs";
import type { TrackMetadata } from "../metadata";
import { expandHome } from "../paths";
import { metadataFromInfo } from "../tags/extract";
import { writeTags } from "../tags/write";
import { renderTemplate } from "../template/template";
import type { YtDlp } from "../ytdlp/client";
import type { DownloadProgress, VideoSummary, YtDlpInfo } from "../ytdlp/types";

export interface TrackRequest {
  video: VideoSummary;
  /** Preenchido quando a faixa vem de uma playlist; ativa o `playlistTemplate`. */
  playlist?: string | undefined;
  index?: number | undefined;
}

export interface TrackResult {
  /** `exists`: o arquivo de destino já existia e não foi sobrescrito. */
  status: "downloaded" | "exists";
  path: string;
  metadata: TrackMetadata;
}

export interface DownloadTrackOptions {
  ytdlp: YtDlp;
  ffmpeg: string;
  config: Pick<Config, "outputDir" | "filenameTemplate" | "playlistTemplate" | "audio">;
  overwrite?: boolean;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: DownloadProgress) => void) | undefined;
}

export function destinationFor(
  metadata: TrackMetadata,
  config: DownloadTrackOptions["config"],
  fromPlaylist: boolean,
): string {
  const template = fromPlaylist ? config.playlistTemplate : config.filenameTemplate;
  return join(expandHome(config.outputDir), renderTemplate(template, metadata));
}

/** Baixa, converte, grava as tags e move a faixa para o destino definido pelo template. */
export async function downloadTrack(
  request: TrackRequest,
  { ytdlp, ffmpeg, config, overwrite = false, signal, onProgress }: DownloadTrackOptions,
): Promise<TrackResult> {
  const workdir = await mkdtemp(join(tmpdir(), "jukeboxdl-"));
  try {
    const files = await ytdlp.downloadAudio(request.video.url, workdir, {
      bitrate: config.audio.bitrate,
      signal,
      onProgress,
    });

    const info = JSON.parse(await readFile(files.info, "utf8")) as YtDlpInfo;
    const metadata = metadataFromInfo(info, { playlist: request.playlist, index: request.index });
    const destination = destinationFor(metadata, config, request.playlist !== undefined);

    if (!overwrite && (await pathExists(destination))) {
      return { status: "exists", path: destination, metadata };
    }

    onProgress?.({ phase: "tag" });
    const tagged = join(workdir, "tagged.mp3");
    await writeTags({
      ffmpeg,
      input: files.audio,
      output: tagged,
      metadata,
      cover: config.audio.embedCover ? files.cover : undefined,
      signal,
    });

    await mkdir(dirname(destination), { recursive: true });
    await moveFile(tagged, destination);
    return { status: "downloaded", path: destination, metadata };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
