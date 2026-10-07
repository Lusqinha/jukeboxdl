import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { rmSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { executableName } from "./binaries/platform";
import { isExecutable, which } from "./binaries/which";
import { debug } from "./log";
import { sleep } from "./retry";
import type { YtDlp } from "./ytdlp/client";

/** Faixa tocável: arquivo local (`path`) ou link do YouTube (`url`, para prévias). */
export interface PlayableTrack {
  id: string;
  title: string;
  artist?: string | undefined;
  album?: string | undefined;
  path?: string | undefined;
  url?: string | undefined;
  /** Segundos. */
  duration?: number | undefined;
}

export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
  status: "idle" | "loading" | "playing" | "paused" | "error";
  track?: PlayableTrack | undefined;
  position: number;
  duration?: number | undefined;
  /** 0 a 100. */
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  engine: "mpv" | "ffplay" | null;
  error?: string | undefined;
  /** Nem mpv nem ffplay disponíveis. */
  unavailable?: boolean | undefined;
}

/** Ordem de reprodução com aleatório e repetição, separada dos motores para ser testável. */
export class PlayQueue {
  items: PlayableTrack[] = [];
  shuffle = false;
  repeat: RepeatMode = "off";
  private order: number[] = [];
  private position = -1;

  constructor(private readonly random: () => number = Math.random) {}

  private shuffled(indices: number[]): number[] {
    const result = [...indices];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [result[i], result[j]] = [result[j] as number, result[i] as number];
    }
    return result;
  }

  /** Carrega a lista começando por `start`; no aleatório, `start` vem primeiro. */
  load(items: PlayableTrack[], start: number): void {
    this.items = items;
    const all = items.map((_, i) => i);
    if (this.shuffle) {
      this.order = [start, ...this.shuffled(all.filter((i) => i !== start))];
      this.position = 0;
    } else {
      this.order = all;
      this.position = start;
    }
  }

  current(): PlayableTrack | undefined {
    const index = this.order[this.position];
    return index === undefined ? undefined : this.items[index];
  }

  /** Próxima faixa; `auto` = terminou sozinha (aí "repetir uma" repete). */
  next(auto: boolean): PlayableTrack | undefined {
    if (this.items.length === 0) return undefined;
    if (auto && this.repeat === "one") return this.current();
    if (this.position < this.order.length - 1) {
      this.position++;
    } else if (this.repeat === "all") {
      if (this.shuffle) this.order = this.shuffled(this.order);
      this.position = 0;
    } else {
      return undefined;
    }
    return this.current();
  }

  previous(): PlayableTrack | undefined {
    if (this.items.length === 0) return undefined;
    if (this.position > 0) this.position--;
    else if (this.repeat === "all") this.position = this.order.length - 1;
    return this.current();
  }

  setShuffle(on: boolean): void {
    if (on === this.shuffle) return;
    const currentIndex = this.order[this.position];
    this.shuffle = on;
    if (currentIndex === undefined) return;
    const all = this.items.map((_, i) => i);
    if (on) {
      this.order = [currentIndex, ...this.shuffled(all.filter((i) => i !== currentIndex))];
      this.position = 0;
    } else {
      this.order = all;
      this.position = currentIndex;
    }
  }
}

interface EngineCallbacks {
  onEnd: () => void;
  onTime: (position: number, duration?: number) => void;
  onError: (message: string) => void;
}

interface Engine {
  readonly name: "mpv" | "ffplay";
  play(source: string, volume: number): Promise<void>;
  setPaused(paused: boolean): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  stop(): void;
  dispose(): void;
}

/** mpv aberto em segundo plano, controlado pelo canal JSON (IPC). */
class MpvEngine implements Engine {
  readonly name = "mpv";
  private child: ChildProcess | null = null;
  private socket: Socket | null = null;
  private buffer = "";
  private position = 0;
  private duration: number | undefined;
  private readonly socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\jukeboxdl-mpv-${process.pid}`
      : join(tmpdir(), `jukeboxdl-mpv-${process.pid}.sock`);

  constructor(
    private readonly mpv: string,
    private readonly ytDlpPath: string,
    private readonly callbacks: EngineCallbacks,
  ) {}

  private async start(volume: number): Promise<void> {
    if (this.socket) return;
    const child = spawn(
      this.mpv,
      [
        "--no-video",
        "--idle=yes",
        "--no-terminal",
        "--really-quiet",
        `--volume=${volume}`,
        `--input-ipc-server=${this.socketPath}`,
        `--script-opts=ytdl_hook-ytdl_path=${this.ytDlpPath}`,
      ],
      { stdio: "ignore" },
    );
    this.child = child;
    child.once("exit", () => {
      this.child = null;
      this.socket?.destroy();
      this.socket = null;
    });
    // O socket aparece logo depois do mpv abrir; tenta conectar por até ~3 s.
    for (let attempt = 0; attempt < 30 && !this.socket; attempt++) {
      await sleep(100);
      this.socket = await new Promise<Socket | null>((resolve) => {
        const socket = connect(this.socketPath);
        socket.once("connect", () => resolve(socket));
        socket.once("error", () => resolve(null));
      });
    }
    if (!this.socket) throw new Error("mpv: não foi possível conectar ao controle");
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string) => this.onData(chunk));
    this.send(["observe_property", 1, "time-pos"]);
    this.send(["observe_property", 2, "duration"]);
  }

  private send(command: unknown[]): void {
    this.socket?.write(`${JSON.stringify({ command })}\n`);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf("\n");
      try {
        const message = JSON.parse(line) as {
          event?: string;
          name?: string;
          data?: unknown;
          reason?: string;
          file_error?: string;
        };
        if (message.event === "property-change") {
          if (message.name === "time-pos" && typeof message.data === "number")
            this.position = message.data;
          if (message.name === "duration" && typeof message.data === "number")
            this.duration = message.data;
          this.callbacks.onTime(this.position, this.duration);
        } else if (message.event === "end-file") {
          // "stop" acontece ao trocar de faixa; só o fim natural avança a fila.
          if (message.reason === "eof") this.callbacks.onEnd();
          else if (message.reason === "error") this.callbacks.onError(message.file_error ?? "mpv");
        }
      } catch {
        // Linha incompleta ou que não é JSON: ignora.
      }
    }
  }

  async play(source: string, volume: number): Promise<void> {
    await this.start(volume);
    this.position = 0;
    this.duration = undefined;
    this.send(["loadfile", source, "replace"]);
    this.send(["set_property", "pause", false]);
  }

  setPaused(paused: boolean): void {
    this.send(["set_property", "pause", paused]);
  }

  seek(seconds: number): void {
    this.send(["seek", seconds, "relative"]);
  }

  setVolume(volume: number): void {
    this.send(["set_property", "volume", volume]);
  }

  stop(): void {
    this.send(["stop"]);
  }

  dispose(): void {
    this.send(["quit"]);
    this.socket?.destroy();
    this.child?.kill();
    if (process.platform !== "win32") rmSync(this.socketPath, { force: true });
  }
}

/**
 * ffplay não tem controle remoto: pausa, avanço e volume reiniciam o processo na posição
 * atual (com -ss e -volume). Há um pequeno corte, mas todos os controles funcionam.
 */
class FfplayEngine implements Engine {
  readonly name = "ffplay";
  private child: ChildProcess | null = null;
  private source: string | null = null;
  private volume = 70;
  private offset = 0;
  private startedAt = 0;
  private paused = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ffplay: string,
    private readonly callbacks: EngineCallbacks,
  ) {}

  private elapsed(): number {
    return this.paused || !this.child
      ? this.offset
      : this.offset + (Date.now() - this.startedAt) / 1000;
  }

  private kill(): void {
    const child = this.child;
    this.child = null;
    child?.kill();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private launch(): void {
    if (!this.source) return;
    this.kill();
    const child = spawn(
      this.ffplay,
      [
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "quiet",
        "-volume",
        String(this.volume),
        "-ss",
        this.offset.toFixed(2),
        this.source,
      ],
      { stdio: "ignore" },
    );
    this.child = child;
    this.startedAt = Date.now();
    child.once("error", (error) => this.callbacks.onError(error.message));
    child.once("exit", (code) => {
      // Só conta como fim da faixa se este ainda for o processo atual (não foi reiniciado).
      if (this.child !== child) return;
      this.kill();
      if (code === 0) this.callbacks.onEnd();
    });
    this.timer = setInterval(() => this.callbacks.onTime(this.elapsed()), 500);
  }

  async play(source: string, volume: number): Promise<void> {
    this.source = source;
    this.volume = volume;
    this.offset = 0;
    this.paused = false;
    this.launch();
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    if (paused) {
      this.offset = this.elapsed();
      this.paused = true;
      this.kill();
    } else {
      this.paused = false;
      this.launch();
    }
    this.callbacks.onTime(this.elapsed());
  }

  seek(seconds: number): void {
    this.offset = Math.max(0, this.elapsed() + seconds);
    if (!this.paused) this.launch();
    this.callbacks.onTime(this.offset);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.paused) return;
    this.offset = this.elapsed();
    this.launch();
  }

  stop(): void {
    this.kill();
    this.source = null;
  }

  dispose(): void {
    this.stop();
  }
}

export class PlayerUnavailableError extends Error {}

interface PlayerEvents {
  change: [state: PlayerState];
}

/**
 * Player de música: toca a biblioteca local e prévias do YouTube, com fila, aleatório,
 * repetir, pausa, avanço e volume. Prefere o mpv; sem ele, usa o ffplay.
 */
export class MusicPlayer extends EventEmitter<PlayerEvents> {
  readonly queue: PlayQueue;
  private engine: Engine | null = null;
  private current: PlayerState = {
    status: "idle",
    position: 0,
    volume: 70,
    shuffle: false,
    repeat: "off",
    engine: null,
  };
  private loadToken = 0;

  constructor(
    private readonly ytdlp: YtDlp,
    private readonly ytDlpPath: string,
    private readonly ffmpegPath: string,
    random?: () => number,
  ) {
    super();
    this.queue = new PlayQueue(random);
  }

  get state(): PlayerState {
    return this.current;
  }

  private set(patch: Partial<PlayerState>): void {
    this.current = { ...this.current, ...patch };
    this.emit("change", this.current);
  }

  private async getEngine(): Promise<Engine> {
    if (this.engine) return this.engine;
    const callbacks: EngineCallbacks = {
      onEnd: () => void this.advance(true),
      onTime: (position, duration) =>
        this.set({ position, ...(duration !== undefined && { duration }) }),
      onError: (message) => this.set({ status: "error", error: message }),
    };
    const mpv = await which("mpv");
    if (mpv) {
      this.engine = new MpvEngine(mpv, this.ytDlpPath, callbacks);
    } else {
      const sibling = join(dirname(this.ffmpegPath), executableName("ffplay"));
      const ffplay = (await isExecutable(sibling)) ? sibling : await which("ffplay");
      if (!ffplay) throw new PlayerUnavailableError("mpv/ffplay");
      this.engine = new FfplayEngine(ffplay, callbacks);
    }
    this.set({ engine: this.engine.name });
    return this.engine;
  }

  private async playCurrent(): Promise<void> {
    const track = this.queue.current();
    if (!track) {
      this.engine?.stop();
      this.set({ status: "idle", position: 0 });
      return;
    }
    const token = ++this.loadToken;
    this.set({ status: "loading", track, position: 0, duration: track.duration, error: undefined });
    try {
      const engine = await this.getEngine();
      let source = track.path ?? track.url ?? "";
      // O ffplay não fala com o YouTube: pega a URL direta do áudio primeiro.
      if (!track.path && track.url && engine.name === "ffplay")
        source = await this.ytdlp.streamUrl(track.url);
      if (token !== this.loadToken) return;
      debug(`player (${engine.name}): ${source}`);
      await engine.play(source, this.current.volume);
      if (token === this.loadToken) this.set({ status: "playing" });
    } catch (error) {
      if (token !== this.loadToken) return;
      this.set({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        unavailable: error instanceof PlayerUnavailableError,
      });
    }
  }

  private async advance(auto: boolean): Promise<void> {
    if (!this.queue.next(auto)) {
      this.engine?.stop();
      this.set({ status: "idle", position: 0 });
      return;
    }
    await this.playCurrent();
  }

  /** Toca a lista a partir de `start` (a lista vira a fila). */
  async playList(tracks: PlayableTrack[], start = 0): Promise<void> {
    this.queue.load(tracks, start);
    await this.playCurrent();
  }

  /** Prévia de um vídeo: se ele já estiver tocando, para (alterna). */
  async togglePreview(track: PlayableTrack): Promise<void> {
    if (this.current.track?.id === track.id && this.current.status !== "idle") return this.stop();
    await this.playList([track], 0);
  }

  async togglePause(): Promise<void> {
    if (this.current.status === "playing") {
      this.engine?.setPaused(true);
      this.set({ status: "paused" });
    } else if (this.current.status === "paused") {
      this.engine?.setPaused(false);
      this.set({ status: "playing" });
    } else if (this.queue.current()) {
      await this.playCurrent();
    }
  }

  next(): Promise<void> {
    return this.advance(false);
  }

  async previous(): Promise<void> {
    // Depois de alguns segundos, "anterior" volta ao começo da faixa atual.
    if (this.current.position > 3 && this.engine) {
      this.engine.seek(-this.current.position);
      return;
    }
    if (this.queue.previous()) await this.playCurrent();
  }

  seek(seconds: number): void {
    if (this.current.status !== "playing" && this.current.status !== "paused") return;
    this.engine?.seek(seconds);
  }

  changeVolume(delta: number): void {
    const volume = Math.min(100, Math.max(0, this.current.volume + delta));
    this.engine?.setVolume(volume);
    this.set({ volume });
  }

  toggleShuffle(): void {
    this.queue.setShuffle(!this.queue.shuffle);
    this.set({ shuffle: this.queue.shuffle });
  }

  cycleRepeat(): void {
    const next: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };
    this.queue.repeat = next[this.queue.repeat];
    this.set({ repeat: this.queue.repeat });
  }

  stop(): void {
    this.loadToken++;
    this.engine?.stop();
    this.set({ status: "idle", position: 0 });
  }

  dispose(): void {
    this.loadToken++;
    this.engine?.dispose();
    this.engine = null;
  }
}
