import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { executableName } from "./binaries/platform";
import { isExecutable, which } from "./binaries/which";
import { debug } from "./log";
import type { YtDlp } from "./ytdlp/client";
import type { VideoSummary } from "./ytdlp/types";

export type PlayerState =
  | { status: "idle" }
  | { status: "loading"; video: VideoSummary }
  | { status: "playing"; video: VideoSummary }
  | { status: "error"; video: VideoSummary; message: string; unavailable?: boolean };

interface PlayerEvents {
  change: [state: PlayerState];
}

export class PlayerUnavailableError extends Error {}

/**
 * Toca uma prévia em segundo plano. Prefere o mpv (que fala direto com o YouTube via
 * yt-dlp); sem ele, usa o ffplay com a URL direta do áudio.
 */
export class Player extends EventEmitter<PlayerEvents> {
  private child: ChildProcess | null = null;
  private abort: AbortController | null = null;
  private current: PlayerState = { status: "idle" };

  constructor(
    private readonly ytdlp: YtDlp,
    private readonly ytDlpPath: string,
    private readonly ffmpegPath: string,
  ) {
    super();
  }

  get state(): PlayerState {
    return this.current;
  }

  private set(state: PlayerState): void {
    this.current = state;
    this.emit("change", state);
  }

  private async findFfplay(): Promise<string | null> {
    const sibling = join(dirname(this.ffmpegPath), executableName("ffplay"));
    if (await isExecutable(sibling)) return sibling;
    return which("ffplay");
  }

  /** Toca o vídeo; se ele já estiver tocando, para (alterna). */
  async toggle(video: VideoSummary): Promise<void> {
    const playingSame =
      this.current.status !== "idle" &&
      "video" in this.current &&
      this.current.video.id === video.id;
    this.stop();
    if (!playingSame) await this.play(video);
  }

  async play(video: VideoSummary): Promise<void> {
    this.stop();
    const controller = new AbortController();
    this.abort = controller;
    this.set({ status: "loading", video });
    try {
      const mpv = await which("mpv");
      let command: string;
      let args: string[];
      if (mpv) {
        command = mpv;
        args = [
          "--no-video",
          "--really-quiet",
          "--no-terminal",
          `--script-opts=ytdl_hook-ytdl_path=${this.ytDlpPath}`,
          video.url,
        ];
      } else {
        const ffplay = await this.findFfplay();
        if (!ffplay) throw new PlayerUnavailableError("mpv/ffplay");
        const url = await this.ytdlp.streamUrl(video.url, controller.signal);
        command = ffplay;
        args = ["-nodisp", "-autoexit", "-loglevel", "quiet", url];
      }
      if (controller.signal.aborted) return;
      debug(`player: ${command} ${video.url}`);
      const child = spawn(command, args, { stdio: "ignore", signal: controller.signal });
      this.child = child;
      child.once("spawn", () => this.set({ status: "playing", video }));
      child.once("error", (error) => {
        if (!controller.signal.aborted)
          this.set({ status: "error", video, message: error.message });
      });
      child.once("exit", () => {
        if (this.child === child) {
          this.child = null;
          if (!controller.signal.aborted) this.set({ status: "idle" });
        }
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      this.set({
        status: "error",
        video,
        message: error instanceof Error ? error.message : String(error),
        unavailable: error instanceof PlayerUnavailableError,
      });
    }
  }

  stop(): void {
    this.abort?.abort();
    this.abort = null;
    this.child = null;
    if (this.current.status !== "idle") this.set({ status: "idle" });
  }
}
