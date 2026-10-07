import { execFile } from "node:child_process";
import { mkdir, mkdtemp, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { which } from "../binaries/which";
import { History } from "../history/history";
import { groupTracks, Library } from "./library";

const exec = promisify(execFile);
const ffmpeg = await which("ffmpeg");
const ffprobe = await which("ffprobe");

async function makeTrack(file: string, tags: Record<string, string>) {
  const metadata = Object.entries(tags).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]);
  await exec(ffmpeg ?? "", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=duration=1",
    ...metadata,
    file,
  ]);
}

describe.skipIf(!ffmpeg || !ffprobe)("Library", () => {
  it("varre, agrupa e só relê arquivos alterados", async () => {
    const root = await mkdtemp(join(tmpdir(), "jukeboxdl-lib-"));
    await mkdir(join(root, "Playlist A"));
    await makeTrack(join(root, "Playlist A", "01.mp3"), {
      title: "Um",
      artist: "Banda X",
      album: "Disco",
      track: "1",
      comment: "https://youtu.be/abcdefghijk",
    });
    await makeTrack(join(root, "Playlist A", "02.mp3"), {
      title: "Dois",
      artist: "Banda X",
      album: "Disco",
      track: "2",
    });
    await makeTrack(join(root, "solta.mp3"), { title: "Solta", artist: "Outra" });

    const history = new History(":memory:");
    const library = new Library(history, ffprobe ?? "");
    await library.scan([root]);
    expect(library.tracks.map((t) => [t.title, t.folder])).toEqual([
      ["Um", "Playlist A"],
      ["Dois", "Playlist A"],
      ["Solta", ""],
    ]);
    expect(library.tracks[0]).toMatchObject({ youtubeId: "abcdefghijk", track: 1, album: "Disco" });
    expect(library.tracks[0]?.duration).toBeGreaterThan(0.5);
    expect(groupTracks(library.tracks, "album").map((g) => [g.label, g.tracks.length])).toEqual([
      ["—", 1],
      ["Disco", 2],
    ]);
    expect(
      groupTracks(library.tracks, "folder")
        .map((g) => g.tracks.length)
        .sort(),
    ).toEqual([1, 2]);

    // Arquivo alterado é relido; os outros vêm do cache.
    await makeTrack(join(root, "solta.mp3"), { title: "Solta (nova)", artist: "Outra" });
    await utimes(join(root, "solta.mp3"), new Date(), new Date(Date.now() + 5000));
    await library.scan([root]);
    expect(library.tracks.map((t) => t.title)).toContain("Solta (nova)");
    history.close();
  }, 15_000);
});
