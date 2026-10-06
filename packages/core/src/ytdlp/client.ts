import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AudioFormat } from "../config/schema";
import { DownloadError } from "../errors";
import { t } from "../i18n/messages";
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
  jsRuntime?: JsRuntime | null;
}

export interface JsRuntime {
  name: "node" | "deno" | "bun";
  path: string;
}

export interface DownloadedFiles {
  audio: string;
  cover: string | undefined;
  /** Um arquivo por capítulo, em ordem, quando `splitChapters` foi pedido. */
  chapters: string[];
}

export interface AudioDownloadOptions {
  format: AudioFormat;
  bitrate: number;
  removeNonMusic: boolean;
  splitChapters: boolean;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: DownloadProgress) => void) | undefined;
}

/** opus e m4a preferem o stream original, para o yt-dlp só copiar o áudio sem reconverter. */
const FORMAT_SELECTORS: Record<AudioFormat, string> = {
  mp3: "bestaudio/best",
  opus: "bestaudio[acodec=opus]/bestaudio/best",
  m4a: "bestaudio[ext=m4a]/bestaudio/best",
};

export class YtDlp {
  private readonly ytDlp: string;
  private readonly baseArgs: string[];

  constructor({
    ytDlp,
    ffmpeg,
    jsRuntime = { name: "node", path: process.execPath },
  }: YtDlpOptions) {
    this.ytDlp = ytDlp;
    this.baseArgs = [
      "--ignore-config",
      "--color",
      "never",
      "--ffmpeg-location",
      ffmpeg,
      ...(jsRuntime ? ["--js-runtimes", `${jsRuntime.name}:${jsRuntime.path}`] : []),
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
        extractError(result.stderr) ?? t("ytdlp.exitCode", { code: String(result.code) }),
      );
    }
    try {
      return JSON.parse(result.stdout) as YtDlpInfo;
    } catch {
      throw new DownloadError(t("ytdlp.invalidJson"));
    }
  }

  async search(query: string, limit = 10, signal?: AbortSignal): Promise<VideoSummary[]> {
    return this.searchPage(query, { limit, ...(signal && { signal }) });
  }

  /** Uma página de resultados: `offset` resultados pulados, até `limit` novos. */
  async searchPage(
    query: string,
    { offset = 0, limit = 20, signal }: { offset?: number; limit?: number; signal?: AbortSignal },
  ): Promise<VideoSummary[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const end = offset + limit;
    const args = [
      `ytsearch${end}:${trimmed}`,
      ...(offset > 0 ? ["--playlist-items", `${offset + 1}:${end}`] : []),
    ];
    return parseSearchResult(await this.json(args, signal));
  }

  /** Lê um link de vídeo ou playlist. Com `noPlaylist`, links `watch?v=…&list=…` viram só o vídeo. */
  async resolve(
    url: string,
    { noPlaylist = false, signal }: { noPlaylist?: boolean; signal?: AbortSignal } = {},
  ): Promise<ResolveResult> {
    if (!/^https?:\/\//i.test(url.trim())) {
      throw new DownloadError(t("ytdlp.notUrl", { url }));
    }
    const json = await this.json([...(noPlaylist ? ["--no-playlist"] : []), url.trim()], signal);
    const result = parseResolveResult(json);
    if (!result) throw new DownloadError(t("ytdlp.noVideos", { url }));
    return result;
  }

  /** Metadados completos de um vídeo (sem baixar), para decidir o destino antes do download. */
  async fetchInfo(url: string, signal?: AbortSignal): Promise<YtDlpInfo> {
    const result = await runCommand(
      this.ytDlp,
      [...this.baseArgs, "--no-playlist", "--dump-json", "--no-warnings", url],
      {
        signal,
      },
    );
    if (result.code !== 0) {
      throw new DownloadError(
        extractError(result.stderr) ?? t("ytdlp.exitCode", { code: String(result.code) }),
      );
    }
    try {
      return JSON.parse(result.stdout) as YtDlpInfo;
    } catch {
      throw new DownloadError(t("ytdlp.invalidJson"));
    }
  }

  /** URL direta do áudio, para tocadores que não falam com o YouTube (ffplay). */
  async streamUrl(url: string, signal?: AbortSignal): Promise<string> {
    const result = await runCommand(
      this.ytDlp,
      [...this.baseArgs, "--no-playlist", "-f", "bestaudio/best", "-g", url],
      {
        signal,
      },
    );
    const direct = result.stdout.trim().split("\n")[0];
    if (result.code !== 0 || !direct) {
      throw new DownloadError(
        extractError(result.stderr) ?? t("ytdlp.exitCode", { code: String(result.code) }),
      );
    }
    return direct;
  }

  /**
   * Baixa o áudio a partir de um JSON obtido por `fetchInfo` (sem extrair de novo), com a
   * thumbnail em JPG e, opcionalmente, dividido por capítulos, dentro de `workdir`.
   */
  async downloadAudio(
    infoFile: string,
    workdir: string,
    options: AudioDownloadOptions,
  ): Promise<DownloadedFiles> {
    const { format, bitrate, removeNonMusic, splitChapters, signal, onProgress } = options;
    const args = [
      ...this.baseArgs,
      "--load-info-json",
      infoFile,
      "-f",
      FORMAT_SELECTORS[format],
      "--extract-audio",
      "--audio-format",
      format,
      ...(format === "mp3" ? ["--audio-quality", `${bitrate}K`] : []),
      ...(removeNonMusic ? ["--sponsorblock-remove", "music_offtopic"] : []),
      "--write-thumbnail",
      "--convert-thumbnails",
      "jpg",
      "-o",
      join(workdir, "%(id)s.%(ext)s"),
      "-o",
      `thumbnail:${join(workdir, "%(id)s.%(ext)s")}`,
      ...(splitChapters
        ? [
            "--split-chapters",
            "-o",
            `chapter:${join(workdir, "chapter-%(section_number)03d.%(ext)s")}`,
          ]
        : []),
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
        extractError(result.stderr) ?? t("ytdlp.exitCode", { code: String(result.code) }),
      );
    }

    const files = await readdir(workdir);
    const isAudio = (file: string) => file.endsWith(`.${format}`);
    const audio = files.find((file) => isAudio(file) && !file.startsWith("chapter-"));
    if (!audio) throw new DownloadError(t("ytdlp.noMp3"));
    const cover = files.find((file) => file.endsWith(".jpg"));
    return {
      audio: join(workdir, audio),
      cover: cover ? join(workdir, cover) : undefined,
      chapters: files
        .filter((file) => file.startsWith("chapter-") && isAudio(file))
        .sort()
        .map((file) => join(workdir, file)),
    };
  }
}
