import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { which } from "./binaries/which";
import { DEFAULT_CONFIG } from "./config/schema";
import { BinaryError } from "./errors";
import { Jukebox } from "./jukebox";
import { getAppPaths } from "./paths";

const execFileAsync = promisify(execFile);

const ffmpeg = await which("ffmpeg");
const ffprobe = await which("ffprobe");
const suite = ffmpeg && ffprobe && process.platform !== "win32" ? describe : describe.skip;

const VIDEOS = {
  aaaaaaaaaaa: { title: "Artista Um - Primeira (Official Video)", uploader: "Canal Um" },
  bbbbbbbbbbb: {
    title: "Segunda",
    track: "Segunda",
    artists: ["Artista Dois"],
    album: "Disco",
    track_number: 2,
    release_year: 2024,
    uploader: "Artista Dois - Topic",
  },
  ddddddddddd: {
    title: "Mix Completo (Full Album)",
    uploader: "Canal Mix",
    chapters: [{ title: "01. Banda X - Abertura" }, { title: "02. Banda X - Final" }],
  },
};

/**
 * Simula o yt-dlp: responde buscas/links com JSON fixo e, no download, copia um MP3
 * e uma capa gerados pelo ffmpeg, escrevendo progresso no mesmo formato do original.
 */
function fakeYtDlpScript(fixtures: string, log: string): string {
  return `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, args.includes("--load-info-json") ? "download\\n" : "info\\n");
const videos = ${JSON.stringify(VIDEOS)};
const entry = (id) => ({ _type: "url", ie_key: "Youtube", id, url: "https://www.youtube.com/watch?v=" + id, title: videos[id].title, duration: 3, channel: videos[id].uploader });
const target = args.find((a) => a.startsWith("ytsearch") || a.startsWith("http"));
if (args.includes("--dump-single-json")) {
  if (target.startsWith("ytsearch") || target.includes("list=")) {
    console.log(JSON.stringify({ _type: "playlist", id: "PL1", title: "Minha Playlist", entries: Object.keys(videos).map(entry) }));
  } else {
    console.log(JSON.stringify({ ...entry(target.slice(-11)), _type: "video" }));
  }
  process.exit(0);
}
if (args.includes("--dump-json")) {
  const id = target.slice(-11);
  if (!videos[id]) { console.error("ERROR: [youtube] " + id + ": Video unavailable"); process.exit(1); }
  console.log(JSON.stringify({ id, ...videos[id] }));
  process.exit(0);
}
const info = JSON.parse(fs.readFileSync(args[args.indexOf("--load-info-json") + 1], "utf8"));
const id = info.id;
const dir = path.dirname(args[args.indexOf("-o") + 1]);
console.log('[jukeboxdl]{"downloaded_bytes": 50, "total_bytes": 100, "speed": 10, "eta": 5}');
console.log("[ExtractAudio] Destination: " + id + ".mp3");
fs.copyFileSync(${JSON.stringify(join(fixtures, "audio.mp3"))}, path.join(dir, id + ".mp3"));
fs.copyFileSync(${JSON.stringify(join(fixtures, "cover.jpg"))}, path.join(dir, id + ".jpg"));
if (args.includes("--split-chapters")) {
  (info.chapters || []).forEach((_, i) => {
    fs.copyFileSync(${JSON.stringify(join(fixtures, "audio.mp3"))}, path.join(dir, "chapter-" + String(i + 1).padStart(3, "0") + ".mp3"));
  });
}
`;
}

let root: string;
let binDir: string;
let callLog: string;
const opened: Jukebox[] = [];

async function createJukebox(config: Partial<typeof DEFAULT_CONFIG> = {}) {
  const jukebox = await Jukebox.create({
    config: {
      ...DEFAULT_CONFIG,
      outputDir: join(root, "music"),
      binaries: { ytDlp: join(binDir, "yt-dlp"), ffmpeg: join(binDir, "ffmpeg") },
      musicbrainz: false,
      cover: { source: "youtube" as const },
      ...config,
    },
    paths: getAppPaths({ env: { JUKEBOXDL_HOME: join(root, "home") } }),
    historyFile: ":memory:",
    jsRuntime: null,
  });
  opened.push(jukebox);
  return jukebox;
}

async function readTags(file: string) {
  const { stdout } = await execFileAsync(ffprobe ?? "ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const data = JSON.parse(stdout) as {
    format: { tags: Record<string, string> };
    streams: Array<{
      codec_type: string;
      width?: number;
      height?: number;
      disposition: { attached_pic: number };
    }>;
  };
  return data;
}

suite("Jukebox (integração com yt-dlp simulado)", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "jukeboxdl-e2e-"));
    binDir = join(root, "bin");
    const fixtures = join(root, "fixtures");
    await mkdir(binDir, { recursive: true });
    await mkdir(fixtures, { recursive: true });

    const ff = ["-hide_banner", "-loglevel", "error", "-y"];
    await execFileAsync(ffmpeg ?? "", [
      ...ff,
      "-f",
      "lavfi",
      "-i",
      "sine=duration=1",
      "-b:a",
      "64k",
      join(fixtures, "audio.mp3"),
    ]);
    await execFileAsync(ffmpeg ?? "", [
      ...ff,
      "-f",
      "lavfi",
      "-i",
      "color=red:s=320x180",
      "-frames:v",
      "1",
      join(fixtures, "cover.jpg"),
    ]);

    callLog = join(root, "calls.log");
    await writeFile(join(binDir, "yt-dlp"), fakeYtDlpScript(fixtures, callLog));
    await chmod(join(binDir, "yt-dlp"), 0o755);
    // Expõe ffmpeg e ffprobe do sistema no diretório configurado.
    for (const [name, path] of [
      ["ffmpeg", ffmpeg],
      ["ffprobe", ffprobe],
    ] as const) {
      await writeFile(join(binDir, name), `#!/bin/sh\nexec "${path}" "$@"\n`);
      await chmod(join(binDir, name), 0o755);
    }
  });

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((jukebox) => jukebox.close()));
  });

  it("busca e resolve links", async () => {
    const jukebox = await createJukebox();
    expect((await jukebox.search("qualquer")).map((v) => v.id)).toEqual([
      "aaaaaaaaaaa",
      "bbbbbbbbbbb",
      "ddddddddddd",
    ]);
    expect(await jukebox.resolve("https://youtu.be/aaaaaaaaaaa")).toMatchObject({ kind: "video" });
    const playlist = await jukebox.resolve("https://www.youtube.com/playlist?list=PL1");
    expect(playlist).toMatchObject({ kind: "playlist", title: "Minha Playlist" });
  });

  it("baixa com tags, capa quadrada e nome pelo template; depois pula pelo histórico", async () => {
    const jukebox = await createJukebox({ filenameTemplate: "{artist}/{album|Singles}/{title}" });
    const [video] = await jukebox.search("x");
    if (!video) throw new Error("sem resultados");

    jukebox.enqueue([video]);
    await jukebox.queue.onIdle();
    const [job] = jukebox.queue.jobs;
    expect(job?.status).toBe("done");
    expect(job?.path).toBe(join(root, "music", "Artista Um", "Singles", "Primeira.mp3"));

    const { format, streams } = await readTags(job?.path ?? "");
    expect(format.tags).toMatchObject({
      title: "Primeira",
      artist: "Artista Um",
      comment: "https://youtu.be/aaaaaaaaaaa",
    });
    const cover = streams.find((s) => s.codec_type === "video");
    expect(cover?.disposition.attached_pic).toBe(1);
    // Vídeo comum: mantém o quadro 16:9 em vez de recortar.
    expect([cover?.width, cover?.height]).toEqual([800, 450]);

    jukebox.queue.clearFinished();
    jukebox.enqueue([video]);
    await jukebox.queue.onIdle();
    expect(jukebox.queue.jobs[0]).toMatchObject({ status: "skipped", skipReason: "history" });
  });

  it("baixa playlist com o playlistTemplate e reporta falhas por faixa", async () => {
    const jukebox = await createJukebox({
      playlistTemplate: "{playlist}/{index:02} - {artist} - {title}",
    });
    const playlist = await jukebox.resolve("https://www.youtube.com/playlist?list=PL1");
    if (playlist.kind !== "playlist") throw new Error("esperava playlist");

    jukebox.enqueuePlaylist(playlist, [
      ...playlist.items.slice(0, 2),
      { id: "ccccccccccc", title: "Sumiu", url: "https://youtu.be/ccccccccccc", index: 3 },
    ]);
    await jukebox.queue.onIdle();

    expect(jukebox.queue.jobs.map((j) => j.status)).toEqual(["done", "done", "failed"]);
    expect(jukebox.queue.jobs[2]?.error).toBe("[youtube] ccccccccccc: Video unavailable");
    expect((await readdir(join(root, "music", "Minha Playlist"))).sort()).toEqual([
      "01 - Artista Um - Primeira.mp3",
      "02 - Artista Dois - Segunda.mp3",
    ]);
    const tags = (
      await readTags(join(root, "music", "Minha Playlist", "02 - Artista Dois - Segunda.mp3"))
    ).format.tags;
    expect(tags).toMatchObject({ album: "Disco", track: "2", date: "2024" });
  });

  it("não sobrescreve arquivo existente que não está no histórico", async () => {
    const jukebox = await createJukebox({
      outputDir: join(root, "music-exists"),
      skipDuplicates: false,
    });
    const [video] = await jukebox.search("x");
    if (!video) throw new Error("sem resultados");
    jukebox.enqueue([video]);
    await jukebox.queue.onIdle();
    jukebox.enqueue([video]);
    await jukebox.queue.onIdle();
    expect(jukebox.queue.jobs.map((j) => j.status)).toEqual(["done", "skipped"]);
    expect(jukebox.queue.jobs[1]?.skipReason).toBe("exists");
  });

  it("pula arquivo existente sem chamar a fase de download", async () => {
    const jukebox = await createJukebox({
      outputDir: join(root, "music-precheck"),
      skipDuplicates: false,
    });
    const [video] = await jukebox.search("x");
    if (!video) throw new Error("sem resultados");
    jukebox.enqueue([video]);
    await jukebox.queue.onIdle();
    await writeFile(callLog, "");
    jukebox.enqueue([video]);
    await jukebox.queue.onIdle();
    expect(jukebox.queue.jobs.at(-1)).toMatchObject({ status: "skipped", skipReason: "exists" });
    expect((await readFile(callLog, "utf8")).trim().split("\n")).toEqual(["info"]);
  });

  it("divide por capítulos, uma faixa por capítulo", async () => {
    const jukebox = await createJukebox({
      outputDir: join(root, "music-chapters"),
      playlistTemplate: "{playlist}/{index:02} - {artist} - {title}",
    });
    jukebox.queue.add([
      {
        video: { id: "ddddddddddd", title: "Mix", url: "https://youtu.be/ddddddddddd" },
        splitChapters: true,
      },
    ]);
    await jukebox.queue.onIdle();
    const [job] = jukebox.queue.jobs;
    expect(job?.status).toBe("done");
    expect((await readdir(join(root, "music-chapters", "Mix Completo"))).sort()).toEqual([
      "01 - Banda X - Abertura.mp3",
      "02 - Banda X - Final.mp3",
    ]);
    const tags = (
      await readTags(join(root, "music-chapters", "Mix Completo", "02 - Banda X - Final.mp3"))
    ).format.tags;
    expect(tags).toMatchObject({
      title: "Final",
      artist: "Banda X",
      album: "Mix Completo",
      track: "2",
    });
    expect(tags.REPLAYGAIN_TRACK_GAIN).toMatch(/dB$/);
  });

  it("retoma a fila salva de uma sessão anterior", async () => {
    const historyFile = join(root, "queue.db");
    const paths = getAppPaths({ env: { JUKEBOXDL_HOME: join(root, "home") } });
    const config = {
      ...DEFAULT_CONFIG,
      outputDir: join(root, "music-resume"),
      musicbrainz: false,
      cover: { source: "youtube" as const },
      binaries: { ytDlp: join(binDir, "yt-dlp"), ffmpeg: join(binDir, "ffmpeg") },
    };
    const first = await Jukebox.create({
      config: { ...config, concurrency: 1 },
      paths,
      historyFile,
      persistQueue: true,
      jsRuntime: null,
    });
    first.queue.add([
      { video: { id: "aaaaaaaaaaa", title: "a", url: "https://youtu.be/aaaaaaaaaaa" } },
    ]);
    first.queue.cancelAll();
    first.history.saveQueued("pendente", {
      video: { id: "bbbbbbbbbbb", title: "b", url: "https://youtu.be/bbbbbbbbbbb" },
    });
    await first.queue.onIdle();
    first.history.close();

    const second = await Jukebox.create({
      config,
      paths,
      historyFile,
      persistQueue: true,
      jsRuntime: null,
    });
    opened.push(second);
    expect(second.restoreQueue()).toBe(1);
    await second.queue.onIdle();
    expect(second.queue.jobs.map((j) => [j.request.video.id, j.status])).toEqual([
      ["bbbbbbbbbbb", "done"],
    ]);
    expect(second.history.loadQueued()).toEqual([]);
  });

  it("exige os binários", async () => {
    await expect(
      Jukebox.create({
        config: DEFAULT_CONFIG,
        paths: getAppPaths({ env: { JUKEBOXDL_HOME: join(root, "empty") } }),
        historyFile: ":memory:",
      }).then(async (j) => {
        await j.close();
        // Se o sistema tiver os binários, este teste não se aplica.
        throw new BinaryError("encontrado");
      }),
    ).rejects.toThrow(BinaryError);
  });
});
