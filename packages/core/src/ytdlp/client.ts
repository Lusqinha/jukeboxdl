import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DownloadError } from "../errors";
import { runCommand } from "../process";
import {
  extractError,
  PROGRESS_PREFIX,
  parseProgressLine,
  parseResolveResult,
  parseSearchResult,
} from "./parse";
import type { DownloadProgress, ResolveResult, VideoSummary, YtDlpInfo } from "./types";

export interface YtDlpOptions {
  ytDlp: string;
  ffmpeg: string;
  /**
   * Runtime JS que o yt-dlp usa para decifrar o YouTube. Por padrão é o próprio Node
   * que roda o app; `null` deixa o yt-dlp decidir.
   */
  jsRuntime?: string | null;
}

export interface DownloadedFiles {
  audio: string;
  info: string;
  cover: string | undefined;
}

export interface AudioDownloadOptions {
  bitrate: number;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: DownloadProgress) => void) | undefined;
}

export class YtDlp {
  private readonly ytDlp: string;
  private readonly baseArgs: string[];

  constructor({ ytDlp, ffmpeg, jsRuntime = process.execPath }: YtDlpOptions) {
    this.ytDlp = ytDlp;
    this.baseArgs = [
      "--ignore-config",
      "--color",
      "never",
      "--ffmpeg-location",
      ffmpeg,
      ...(jsRuntime ? ["--js-runtimes", `node:${jsRuntime}`] : []),
    ];
  }

  private async json(args: string[], signal?: AbortSignal): Promise<YtDlpInfo> {
    const result = await runCommand(
      this.ytDlp,
      [...this.baseArgs, "--flat-playlist", "--dump-single-json", "--no-warnings", ...args],
      { signal },
    );
    if (result.code !== 0) {
      throw new DownloadError(
        extractError(result.stderr) ?? `yt-dlp saiu com código ${result.code}`,
      );
    }
    try {
      return JSON.parse(result.stdout) as YtDlpInfo;
    } catch {
      throw new DownloadError("Resposta inesperada do yt-dlp (JSON inválido)");
    }
  }

  async search(query: string, limit = 10, signal?: AbortSignal): Promise<VideoSummary[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return parseSearchResult(await this.json([`ytsearch${limit}:${trimmed}`], signal));
  }

  /** Lê um link de vídeo ou playlist. Com `noPlaylist`, links `watch?v=…&list=…` viram só o vídeo. */
  async resolve(
    url: string,
    { noPlaylist = false, signal }: { noPlaylist?: boolean; signal?: AbortSignal } = {},
  ): Promise<ResolveResult> {
    if (!/^https?:\/\//i.test(url.trim())) {
      throw new DownloadError(`Não parece um link: ${url}`);
    }
    const json = await this.json([...(noPlaylist ? ["--no-playlist"] : []), url.trim()], signal);
    const result = parseResolveResult(json);
    if (!result) throw new DownloadError(`Nenhum vídeo disponível em ${url}`);
    return result;
  }

  /** Baixa o áudio como MP3, com o JSON de metadados e a thumbnail em JPG, dentro de `workdir`. */
  async downloadAudio(
    url: string,
    workdir: string,
    { bitrate, signal, onProgress }: AudioDownloadOptions,
  ): Promise<DownloadedFiles> {
    const args = [
      ...this.baseArgs,
      url,
      "--no-playlist",
      "-f",
      "bestaudio/best",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      `${bitrate}K`,
      "--write-info-json",
      "--write-thumbnail",
      "--convert-thumbnails",
      "jpg",
      "-o",
      join(workdir, "%(id)s.%(ext)s"),
      "--newline",
      "--progress-template",
      `download:${PROGRESS_PREFIX}%(progress)j`,
    ];

    const result = await runCommand(this.ytDlp, args, {
      signal,
      onStdoutLine: (line) => {
        const progress = parseProgressLine(line);
        if (progress) onProgress?.(progress);
      },
    });
    if (result.code !== 0) {
      throw new DownloadError(
        extractError(result.stderr) ?? `yt-dlp saiu com código ${result.code}`,
      );
    }

    const files = await readdir(workdir);
    const find = (suffix: string) => files.find((file) => file.endsWith(suffix));
    const audio = find(".mp3");
    const info = find(".info.json");
    if (!audio || !info) {
      throw new DownloadError("O yt-dlp terminou, mas o MP3 não foi gerado");
    }
    const cover = find(".jpg");
    return {
      audio: join(workdir, audio),
      info: join(workdir, info),
      cover: cover ? join(workdir, cover) : undefined,
    };
  }
}
