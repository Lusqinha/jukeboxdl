import { join } from "node:path";
import { detectBinary } from "./binaries/detect";
import type { BinaryName } from "./binaries/platform";
import { which } from "./binaries/which";
import type { Config } from "./config/schema";
import { loadConfig } from "./config/store";
import type { CoverSource } from "./covers/providers";
import { updateCover } from "./covers/update";
import { DownloadQueue, FINISHED_STATUSES, type Job, type JobWorker } from "./download/queue";
import { downloadTrack, type TrackRequest } from "./download/track";
import { BinaryError } from "./errors";
import { pathExists } from "./fs";
import { History } from "./history/history";
import { t } from "./i18n/messages";
import { Library } from "./library/library";
import { type AppPaths, expandHome, getAppPaths } from "./paths";
import { MusicPlayer } from "./player";
import { loadRecentDestinations } from "./system/drives";
import { type JsRuntime, YtDlp } from "./ytdlp/client";
import type { PlaylistItem, ResolveResult, VideoSummary } from "./ytdlp/types";

export interface JukeboxOptions {
  config?: Config;
  paths?: AppPaths;
  /** Caminho do banco do histórico; `:memory:` para não persistir. */
  historyFile?: string;
  /** Repassado ao cliente do yt-dlp (veja `YtDlpOptions.jsRuntime`). */
  jsRuntime?: JsRuntime | null;
  /** Guarda a fila no histórico para retomar downloads ao reabrir (usado pela interface). */
  persistQueue?: boolean;
  /** Novas tentativas para erros temporários de rede. */
  retries?: number;
}

/**
 * Runtime JS para o yt-dlp. Rodando no Node, é o próprio Node; num binário compilado com
 * Bun, procura node, deno ou bun no PATH.
 */
async function defaultJsRuntime(): Promise<JsRuntime | null> {
  if (!process.versions.bun) return { name: "node", path: process.execPath };
  for (const name of ["node", "deno", "bun"] as const) {
    const path = await which(name);
    if (path) return { name, path };
  }
  return null;
}

async function requireBinary(name: BinaryName, config: Config, paths: AppPaths): Promise<string> {
  const info = await detectBinary(name, { binaries: config.binaries, paths });
  if (!info) {
    throw new BinaryError(t("binary.notFound", { name }));
  }
  return info.path;
}

/** Ponto de entrada do core: busca, leitura de links e fila de downloads com histórico. */
export class Jukebox {
  readonly queue: DownloadQueue;

  readonly player: MusicPlayer;
  readonly library: Library;

  private constructor(
    private currentConfig: Config,
    readonly ytdlp: YtDlp,
    private readonly ffmpeg: string,
    readonly history: History,
    private readonly persistQueue: boolean,
    retries: number,
    ytDlpPath: string,
    private readonly ffprobe: string,
  ) {
    this.queue = new DownloadQueue(this.worker, {
      concurrency: currentConfig.concurrency,
      retries,
    });
    this.player = new MusicPlayer(ytdlp, ytDlpPath, ffmpeg);
    this.library = new Library(history, ffprobe);
    if (persistQueue) {
      this.queue.on("update", (job) => {
        if (job.status === "queued") this.history.saveQueued(job.id, job.request);
        else if (FINISHED_STATUSES.has(job.status)) this.history.removeQueued(job.id);
      });
    }
  }

  /** Recoloca na fila os downloads que ficaram pendentes na última sessão. */
  restoreQueue(): number {
    if (!this.persistQueue) return 0;
    const saved = this.history.loadQueued<TrackRequest>();
    for (const { id } of saved) this.history.removeQueued(id);
    this.queue.add(saved.map(({ request }) => request));
    return saved.length;
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

  /** Busca e embute uma capa nova num arquivo já baixado (fonte da config por padrão). */
  updateCover(
    file: string,
    source: CoverSource = this.currentConfig.cover.source,
    signal?: AbortSignal,
  ) {
    return updateCover(file, { source, ffmpeg: this.ffmpeg, ffprobe: this.ffprobe, signal });
  }

  /** Pastas que a biblioteca varre: a pasta de música e os destinos usados recentemente. */
  async libraryRoots(extra: string[] = []): Promise<string[]> {
    const recent = await loadRecentDestinations();
    return [...new Set([expandHome(this.currentConfig.outputDir), ...recent, ...extra])];
  }

  /** Atualiza a biblioteca a partir das pastas de música. */
  async scanLibrary(extra: string[] = []): Promise<void> {
    await this.library.scan(await this.libraryRoots(extra));
  }

  /** Se o vídeo já foi baixado e o arquivo ainda existe. */
  async isDownloaded(videoId: string): Promise<boolean> {
    const entry = this.history.find(videoId);
    return entry !== undefined && (await pathExists(entry.path));
  }

  static async create(options: JukeboxOptions = {}): Promise<Jukebox> {
    const paths = options.paths ?? getAppPaths();
    const config = options.config ?? (await loadConfig(paths.configFile));
    const [ytDlp, ffmpeg, ffprobe] = await Promise.all([
      requireBinary("yt-dlp", config, paths),
      requireBinary("ffmpeg", config, paths),
      requireBinary("ffprobe", config, paths),
    ]);
    const history = new History(options.historyFile ?? join(paths.data, "history.db"));
    const jsRuntime =
      options.jsRuntime !== undefined ? options.jsRuntime : await defaultJsRuntime();
    const client = new YtDlp({ ytDlp, ffmpeg, jsRuntime });
    return new Jukebox(
      config,
      client,
      ffmpeg,
      history,
      options.persistQueue ?? false,
      options.retries ?? 2,
      ytDlp,
      ffprobe,
    );
  }

  search(query: string, limit?: number, signal?: AbortSignal): Promise<VideoSummary[]> {
    return this.ytdlp.search(query, limit, signal);
  }

  searchPage(
    query: string,
    options: { offset?: number; limit?: number; signal?: AbortSignal },
  ): Promise<VideoSummary[]> {
    return this.ytdlp.searchPage(query, options);
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
    this.player.dispose();
    this.queue.cancelAll();
    await this.queue.onIdle();
    this.history.close();
  }

  private readonly worker: JobWorker = async (request: TrackRequest, { signal, onProgress }) => {
    if (this.currentConfig.skipDuplicates && !request.redownload) {
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
