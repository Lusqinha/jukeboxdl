import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { which } from "./binaries/which";
import { MusicPlayer, type PlayableTrack, type PlayerState, PlayQueue } from "./player";
import type { YtDlp } from "./ytdlp/client";

const track = (id: string): PlayableTrack => ({ id, title: id, path: `/${id}.mp3` });
const ids = (tracks: Array<PlayableTrack | undefined>) => tracks.map((t) => t?.id ?? "-");

describe("PlayQueue", () => {
  it("segue a lista e para no fim sem repetir", () => {
    const queue = new PlayQueue();
    queue.load([track("a"), track("b"), track("c")], 1);
    expect(ids([queue.current(), queue.next(true), queue.next(true)])).toEqual(["b", "c", "-"]);
  });

  it("repetir tudo volta ao início; repetir uma só repete quando termina sozinha", () => {
    const queue = new PlayQueue();
    queue.load([track("a"), track("b")], 1);
    queue.repeat = "all";
    expect(queue.next(true)?.id).toBe("a");
    queue.repeat = "one";
    expect(queue.next(true)?.id).toBe("a");
    expect(queue.next(false)?.id).toBe("b");
  });

  it("aleatório começa pela faixa escolhida e passa por todas", () => {
    let seed = 0.37;
    const queue = new PlayQueue(() => {
      seed = ((seed * 9301 + 49297) % 233280) / 233280;
      return seed;
    });
    queue.shuffle = true;
    const items = ["a", "b", "c", "d", "e"].map(track);
    queue.load(items, 2);
    const played = [queue.current()];
    for (let i = 0; i < 4; i++) played.push(queue.next(false));
    expect(played[0]?.id).toBe("c");
    expect(new Set(ids(played))).toEqual(new Set(["a", "b", "c", "d", "e"]));
    expect(queue.next(false)).toBeUndefined();
  });

  it("anterior volta na ordem e desligar o aleatório mantém a faixa atual", () => {
    const queue = new PlayQueue(() => 0);
    queue.load(["a", "b", "c"].map(track), 0);
    queue.next(false);
    expect(queue.previous()?.id).toBe("a");
    queue.setShuffle(true);
    expect(queue.current()?.id).toBe("a");
    queue.setShuffle(false);
    expect(queue.current()?.id).toBe("a");
  });
});

const ffplay = await which("ffplay");
const ffmpeg = await which("ffmpeg");
const mpv = await which("mpv");

// Sem som: o SDL do ffplay usa um driver de áudio nulo durante o teste.
describe.skipIf(!ffplay || !ffmpeg || mpv)("MusicPlayer com ffplay", () => {
  it("toca e passa sozinho para a próxima faixa", async () => {
    process.env.SDL_AUDIODRIVER = "dummy";
    const dir = await mkdtemp(join(tmpdir(), "jukeboxdl-player-"));
    const files = ["one", "two"].map((name) => join(dir, `${name}.mp3`));
    for (const file of files) {
      await promisify(execFile)(ffmpeg ?? "", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=duration=0.6",
        file,
      ]);
    }
    const player = new MusicPlayer({} as YtDlp, "", ffmpeg ?? "");
    const seen: string[] = [];
    player.on("change", (state: PlayerState) => {
      const label = `${state.status}:${state.track?.id}`;
      if (seen.at(-1) !== label) seen.push(label);
    });
    await player.playList(
      files.map((path, i) => ({ id: String(i), title: String(i), path })),
      0,
    );
    await new Promise<void>((resolve) => {
      player.on("change", (state) => {
        if (state.status === "idle") resolve();
      });
    });
    player.dispose();
    expect(player.state.engine).toBe("ffplay");
    expect(seen).toEqual(expect.arrayContaining(["playing:0", "playing:1"]));
    expect(seen.indexOf("playing:1")).toBeGreaterThan(seen.indexOf("playing:0"));
  }, 15_000);
});
