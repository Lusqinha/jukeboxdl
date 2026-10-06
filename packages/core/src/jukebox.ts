import { join } from "node:path";
import { detectBinary } from "./binaries/detect";
import type { BinaryName } from "./binaries/platform";
import type { Config } from "./config/schema";
import { loadConfig } from "./config/store";
import { DownloadQueue, type Job, type JobWorker } from "./download/queue";
import { downloadTrack, type TrackRequest } from "./download/track";
import { BinaryError } from "./errors";
import { pathExists } from "./fs";
import { History } from "./history/history";
import { type AppPaths, getAppPaths } from "./paths";
import { YtDlp } from "./ytdlp/client";
import type { PlaylistItem, ResolveResult, VideoSummary } from "./ytdlp/types";

export interface JukeboxOptions {
  config?: Config;
  paths?: AppPaths;
  /** Caminho do banco do histórico; `:memory:` para não persistir. */
  historyFile?: string;
  /** Repassado ao cliente do yt-dlp (veja `YtDlpOptions.jsRuntime`). */
  jsRuntime?: string | null;
}

async function requireBinary(name: BinaryName, config: Config, paths: AppPaths): Promise<string> {
  const info = await detectBinary(name, { binaries: config.binaries, paths });
  if (!info) {
    throw new BinaryError(
      `${name} não encontrado. Rode \`jukeboxdl deps install\` ou instale pelo gerenciador de pacotes do sistema.`,
    );
  }
  return info.path;
}

/** Ponto de entrada do core: busca, leitura de links e fila de downloads com histórico. */
export class Jukebox {
  readonly queue: DownloadQueue;

  private constructor(
    private currentConfig: Config,
    readonly ytdlp: YtDlp,
    private readonly ffmpeg: string,
    readonly history: History,
  ) {
    this.queue = new DownloadQueue(this.worker, currentConfig.concurrency);
  }

  get config(): Config {
    return this.currentConfig;
  }

  /**
   * Aplica uma nova config às próximas faixas (pasta, templates, áudio, concorrência).
   * Mudanças nos caminhos dos binários só valem ao reabrir o app.
   */
  setConfig(config: Config): void {
    this.currentConfig = config;
    this.queue.setConcurrency(config.concurrency);
  }

  /** Se o vídeo já foi baixado e o arquivo ainda existe. */
  async isDownloaded(videoId: string): Promise<boolean> {
    const entry = this.history.find(videoId);
    return entry !== undefined && (await pathExists(entry.path));
  }

  static async create(options: JukeboxOptions = {}): Promise<Jukebox> {
    const paths = options.paths ?? getAppPaths();
    const config = options.config ?? (await loadConfig(paths.configFile));
    const [ytDlp, ffmpeg] = await Promise.all([
      requireBinary("yt-dlp", config, paths),
      requireBinary("ffmpeg", config, paths),
      requireBinary("ffprobe", config, paths),
    ]);
    const history = new History(options.historyFile ?? join(paths.data, "history.db"));
    const client = new YtDlp({
      ytDlp,
      ffmpeg,
      ...(options.jsRuntime !== undefined && { jsRuntime: options.jsRuntime }),
    });
    return new Jukebox(config, client, ffmpeg, history);
  }

  search(query: string, limit?: number, signal?: AbortSignal): Promise<VideoSummary[]> {
    return this.ytdlp.search(query, limit, signal);
  }

  resolve(
    url: string,
    options?: { noPlaylist?: boolean; signal?: AbortSignal },
  ): Promise<ResolveResult> {
    return this.ytdlp.resolve(url, options);
  }

  /** Coloca vídeos avulsos na fila. */
  enqueue(videos: VideoSummary[]): Job[] {
    return this.queue.add(videos.map((video) => ({ video })));
  }

  /** Coloca faixas de uma playlist na fila, mantendo nome e posição originais. */
  enqueuePlaylist(playlist: { title: string }, items: PlaylistItem[]): Job[] {
    return this.queue.add(
      items.map((item) => ({ video: item, playlist: playlist.title, index: item.index })),
    );
  }

  /** Cancela os downloads e fecha o histórico. */
  async close(): Promise<void> {
    this.queue.cancelAll();
    await this.queue.onIdle();
    this.history.close();
  }

  private readonly worker: JobWorker = async (request: TrackRequest, { signal, onProgress }) => {
    if (this.currentConfig.skipDuplicates) {
      const previous = this.history.find(request.video.id);
      if (previous && (await pathExists(previous.path))) {
        return { kind: "skipped", reason: "history", path: previous.path };
      }
    }

    const result = await downloadTrack(request, {
      ytdlp: this.ytdlp,
      ffmpeg: this.ffmpeg,
      config: this.currentConfig,
      signal,
      onProgress,
    });

    const { metadata } = result;
    this.history.record({
      videoId: request.video.id,
      path: result.path,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      playlist: metadata.playlist,
    });

    return result.status === "exists"
      ? { kind: "skipped", reason: "exists", path: result.path }
      : { kind: "done", result };
  };
}
