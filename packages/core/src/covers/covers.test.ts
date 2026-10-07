import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { which } from "../binaries/which";
import { buildTagArgs } from "../tags/write";
import { findCover, providerOrder, sameTrack } from "./providers";
import { readTags, replaceCover } from "./update";

const exec = promisify(execFile);
const ffmpeg = await which("ffmpeg");
const ffprobe = await which("ffprobe");
const image = Buffer.alloc(5000, 1);

/** fetch falso: responde por trecho de URL. */
function fakeFetch(routes: Array<[string, unknown]>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const route = routes.find(([part]) => url.includes(part));
    if (!route) return new Response("{}", { status: 404 });
    const [, body] = route;
    if (Buffer.isBuffer(body))
      return new Response(body, { headers: { "content-type": "image/jpeg" } });
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("provedores de capa", () => {
  it("só aceita a mesma música", () => {
    expect(sameTrack({ title: "Faded", artist: "Alan Walker" }, "Faded", "Alan Walker")).toBe(true);
    expect(
      sameTrack({ title: "Faded", artist: "Alan Walker, Iselin" }, "Faded (Remix)", "Alan Walker"),
    ).toBe(true);
    expect(sameTrack({ title: "Faded", artist: "Alan Walker" }, "Fade", "Alan Walker")).toBe(false);
    expect(sameTrack({ title: "Faded", artist: "Alan Walker" }, "Faded", "Outra Banda")).toBe(
      false,
    );
  });

  it("auto cai para o Deezer quando o MusicBrainz não acha nada", async () => {
    const fetchImpl = fakeFetch([
      ["musicbrainz.org", { recordings: [] }],
      [
        "api.deezer.com",
        {
          data: [
            { title: "Outra", artist: { name: "X" } },
            {
              title: "Faded",
              artist: { name: "Alan Walker" },
              album: { cover_xl: "https://cdn/cover.jpg" },
            },
          ],
        },
      ],
      ["cdn/cover.jpg", image],
    ]);
    const found = await findCover({ title: "Faded", artist: "Alan Walker" }, "auto", {
      fetch: fetchImpl,
    });
    expect(found).toMatchObject({ source: "deezer", url: "https://cdn/cover.jpg" });
  });

  it("pede a imagem grande ao iTunes e respeita a fonte youtube", async () => {
    const fetchImpl = fakeFetch([
      [
        "itunes.apple.com",
        {
          results: [
            {
              trackName: "Faded",
              artistName: "Alan Walker",
              artworkUrl100: "https://is1/a/100x100bb.jpg",
            },
          ],
        },
      ],
      ["1000x1000bb.jpg", image],
    ]);
    const found = await findCover({ title: "Faded", artist: "Alan Walker" }, "itunes", {
      fetch: fetchImpl,
    });
    expect(found?.url).toBe("https://is1/a/1000x1000bb.jpg");
    expect(providerOrder("youtube")).toEqual([]);
    expect(providerOrder("auto")).not.toContain("itunes");
  });
});

describe.skipIf(!ffmpeg || !ffprobe)("troca de capa em arquivo existente", () => {
  it.each(["mp3", "opus"] as const)("%s: troca a capa e preserva as tags", async (format) => {
    const dir = await mkdtemp(join(tmpdir(), "jukeboxdl-recover-"));
    const raw = join(dir, `raw.${format}`);
    const ff = ["-hide_banner", "-loglevel", "error", "-y"];
    await exec(ffmpeg ?? "", [
      ...ff,
      "-f",
      "lavfi",
      "-i",
      "sine=duration=1",
      ...(format === "opus" ? ["-c:a", "libopus"] : []),
      raw,
    ]);
    const file = join(dir, `song.${format}`);
    if (format === "mp3") {
      await exec(
        ffmpeg ?? "",
        buildTagArgs({
          ffmpeg: "",
          input: raw,
          output: file,
          format,
          workdir: dir,
          metadata: { id: "abcdefghijk", title: "Song", artist: "Band" },
          extraTags: { REPLAYGAIN_TRACK_GAIN: "-3.00 dB" },
        }),
      );
    } else {
      await exec(ffmpeg ?? "", [
        ...ff,
        "-i",
        raw,
        "-c",
        "copy",
        "-metadata:s:a:0",
        "title=Song",
        "-metadata:s:a:0",
        "artist=Band",
        "-metadata:s:a:0",
        "REPLAYGAIN_TRACK_GAIN=-3.00 dB",
        file,
      ]);
    }
    const coverPath = join(dir, "c.jpg");
    await exec(ffmpeg ?? "", [
      ...ff,
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=600x600",
      "-frames:v",
      "1",
      coverPath,
    ]);

    const ok = await replaceCover({
      ffmpeg: ffmpeg ?? "",
      ffprobe: ffprobe ?? "",
      file,
      cover: { path: coverPath, width: 600, height: 600 },
      workdir: dir,
    });
    expect(ok).toBe(true);
    const tags = await readTags(ffprobe ?? "", file);
    expect(tags).toMatchObject({
      title: "Song",
      artist: "Band",
      replaygain_track_gain: "-3.00 dB",
    });
    const { stdout } = await exec(ffprobe ?? "", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,width,height",
      "-of",
      "csv=p=0",
      file,
    ]);
    expect(stdout).toContain("video,600,600");
    expect((await readFile(file)).length).toBeGreaterThan(1000);
  });
});
